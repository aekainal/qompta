/**
 * Windows Hello login (same mechanism as QSSH, see `keyring.ts`).
 *
 * A Windows Hello key credential (an RSA key held by the TPM / Windows, usable
 * only after the user's face, fingerprint or PIN) signs a random challenge stored
 * in the keyring. The signature, never stored, derives the key that wraps the
 * data key.
 *
 * WinRT is reached through Windows PowerShell 5.1 (not pwsh: it lacks WinRT
 * projections), so Qompta needs no extra native module. The script receives only
 * the challenge (not secret) and prints one JSON line. PowerShell 5.1 cannot pass
 * a WinRT `IBuffer` it received (a bare `__ComObject`) to a method: it goes
 * through a reflection `Invoke` (the `ToArray` call).
 *
 * Cannot be tested from WSL beyond `IsSupportedAsync`: the prompt is tested on
 * Windows by hand. Linux and macOS: no Hello, password only.
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { HELLO_CREDENTIAL } from "./keyring.js";

type HelloAction = "supported" | "enroll" | "sign" | "delete";

interface HelloOutput {
  ok: boolean;
  status?: string;
  signature?: string;
}

const psLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

export function helloScript(action: HelloAction, credential: string, challenge = ""): string {
  return `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)) }
try {
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
  $null = [Windows.Security.Credentials.KeyCredentialManager, Windows.Security.Credentials, ContentType = WindowsRuntime]
  $null = [Windows.Storage.Streams.IBuffer, Windows.Storage.Streams, ContentType = WindowsRuntime]
  $ext = [System.WindowsRuntimeSystemExtensions].GetMethods()
  $asTaskOp = $ext | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' } | Select-Object -First 1
  $asTaskAction = $ext | Where-Object { $_.Name -eq 'AsTask' -and -not $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncAction' } | Select-Object -First 1
  function Await($op, [Type]$type) { $t = $asTaskOp.MakeGenericMethod($type).Invoke($null, @($op)); $null = $t.Wait(-1); $t.Result }
  function AwaitAction($op) { $t = $asTaskAction.Invoke($null, @($op)); $null = $t.Wait(-1) }
  $KCM = [Windows.Security.Credentials.KeyCredentialManager]
  $Retrieval = [Windows.Security.Credentials.KeyCredentialRetrievalResult]
  $action = ${psLiteral(action)}
  $name = ${psLiteral(credential)}

  if (-not (Await ($KCM::IsSupportedAsync()) ([bool]))) { Emit @{ ok = $false; status = 'NotSupported' }; exit 0 }
  if ($action -eq 'supported') { Emit @{ ok = $true }; exit 0 }
  if ($action -eq 'delete') {
    try { AwaitAction ($KCM::DeleteAsync($name)) } catch { }
    Emit @{ ok = $true }; exit 0
  }

  # The prompt belongs to another process and opens behind the Qompta window
  # (focus-stealing prevention). A background thread brings it to the front;
  # this script, started by the foreground app, may hand the focus over.
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class QomptaHelloFocus {
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  public static void Start() {
    var thread = new Thread(() => {
      // Once in front, the user may switch away freely: stop there.
      int tries = 0;
      for (int i = 0; i < 1200 && tries < 30; i++) {
        IntPtr dialog = FindWindow("Credential Dialog Xaml Host", null);
        if (dialog != IntPtr.Zero) {
          if (GetForegroundWindow() == dialog) return;
          tries++;
          // A synthetic Alt press lifts the foreground lock.
          keybd_event(0x12, 0, 0, UIntPtr.Zero);
          keybd_event(0x12, 0, 2, UIntPtr.Zero);
          SetForegroundWindow(dialog);
        }
        Thread.Sleep(100);
      }
    });
    thread.IsBackground = true;
    thread.Start();
  }
}
'@
  [QomptaHelloFocus]::Start()

  $r = Await ($KCM::OpenAsync($name)) ($Retrieval)
  if ($r.Status -ne 'Success') {
    if ($action -ne 'enroll') { Emit @{ ok = $false; status = "$($r.Status)" }; exit 0 }
    $r = Await ($KCM::RequestCreateAsync($name, [Windows.Security.Credentials.KeyCredentialCreationOption]::ReplaceExisting)) ($Retrieval)
    if ($r.Status -ne 'Success') { Emit @{ ok = $false; status = "$($r.Status)" }; exit 0 }
  }
  $buffers = [System.Runtime.InteropServices.WindowsRuntime.WindowsRuntimeBufferExtensions]
  $buffer = $buffers::AsBuffer([Convert]::FromBase64String(${psLiteral(challenge)}))
  $s = Await ($r.Credential.RequestSignAsync($buffer)) ([Windows.Security.Credentials.KeyCredentialOperationResult])
  if ($s.Status -ne 'Success') { Emit @{ ok = $false; status = "$($s.Status)" }; exit 0 }
  # PowerShell 5.1 cannot bind the returned IBuffer (a bare __ComObject) to a
  # method parameter; a reflection call lets the CLR cast it.
  $toArray = $buffers.GetMethods() | Where-Object { $_.Name -eq 'ToArray' -and $_.GetParameters().Count -eq 1 } | Select-Object -First 1
  $signature = [byte[]]$toArray.Invoke($null, @($s.Result))
  Emit @{ ok = $true; signature = [Convert]::ToBase64String($signature) }
} catch {
  Emit @{ ok = $false; status = 'Error'; message = "$($_.Exception.Message)" }
}
`;
}

function powershellPath(): string {
  const root = process.env.SystemRoot ?? "C:\\Windows";
  return join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function run(script: string, timeoutMs: number): Promise<HelloOutput> {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn(
      powershellPath(),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", () => resolve({ ok: false, status: "Error" }));
    child.on("close", () => {
      clearTimeout(timer);
      const line = stdout.split(/\r?\n/).find((l) => l.startsWith("{"));
      try {
        resolve(line ? (JSON.parse(line) as HelloOutput) : { ok: false, status: "Error" });
      } catch {
        resolve({ ok: false, status: "Error" });
      }
    });
  });
}

let supported: Promise<boolean> | null = null;

/** Windows only; the answer is cached (the first check takes a second or two). */
export function isHelloSupported(): Promise<boolean> {
  if (process.platform !== "win32") return Promise.resolve(false);
  supported ??= run(helloScript("supported", HELLO_CREDENTIAL), 30_000).then((r) => r.ok);
  return supported;
}

/** Asks Windows Hello to sign; creates the credential first when `enroll` is set. */
export async function helloSign(challenge: Buffer, enroll: boolean): Promise<Buffer> {
  if (!(await isHelloSupported())) throw new Error("Windows Hello n'est pas disponible sur ce poste.");
  const out = await run(
    helloScript(enroll ? "enroll" : "sign", HELLO_CREDENTIAL, challenge.toString("base64")),
    120_000,
  );
  if (out.ok && out.signature) return Buffer.from(out.signature, "base64");
  if (out.status === "UserCanceled") throw new Error("Windows Hello annulé.");
  if (out.status === "NotFound") {
    throw new Error("Windows Hello ne connaît plus Qompta : connectez-vous avec le mot de passe, puis réactivez-le dans Réglages.");
  }
  throw new Error(`Windows Hello a échoué (${out.status ?? "erreur inconnue"}).`);
}

export async function helloDelete(): Promise<void> {
  if (!(await isHelloSupported())) return;
  await run(helloScript("delete", HELLO_CREDENTIAL), 30_000);
}
