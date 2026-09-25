/**
 * Catalogue of contract templates: ready-to-use STRUCTURES, each one a list of
 * typed sections (see `contract-blocks.ts`). When creating a template or a
 * contract, one of them is used as a start, then built on freely.
 *
 * PURE module. The texts follow Swiss law (CO) and remain working drafts: the
 * numeric values are `{{…}}` variables (see `contract-template.ts`), resolved
 * when the contract is created.
 */

import type { ContractBlockDraft } from "./contract-blocks.js";

export interface ContractModel {
  key: string;
  name: string;
  description: string;
  /** Keywords displayed on the template card. */
  tags: string[];
  blocks: ContractBlockDraft[];
}

const SIGNATURES: ContractBlockDraft = {
  type: "signatures",
  signatureIds: [],
  placeDate: true,
  providerTitle: "Le Prestataire",
  clientTitle: "Le Client",
  clientMention: "Lu et approuvé, bon pour accord",
  clientSignatories: 1,
};

const PARTIES: ContractBlockDraft = {
  type: "parties",
  intro: "Entre les soussignés :",
  providerLabel: "le Prestataire",
  clientLabel: "le Client",
};

const article = (title: string, body: string): ContractBlockDraft => ({ type: "article", title, body });

const FOR_JURIDIQUE = article(
  "Droit applicable et for",
  "Le présent contrat est soumis au droit suisse. En cas de litige, les parties s'efforceront " +
    "d'abord de trouver une solution amiable. À défaut, les tribunaux compétents du canton de " +
    "{{canton}} seront saisis.",
);

/**
 * Clauses of the Qwasar service contract (15 clauses), taken from the contracts
 * attached to the existing quotes.
 */
export const QWASAR_ARTICLES: { title: string; body: string }[] = [
  {
    title: "Objet",
    body:
      "Le présent contrat porte sur l'ensemble des prestations décrites dans le devis signé, qui " +
      "en fait partie intégrante : aussi bien les prestations ponctuelles (création du site " +
      "internet, développement, mise en ligne) que les prestations récurrentes (maintenance du " +
      "site, maintenance serveur, gestion du nom de domaine, hébergement). Le client s'engage à " +
      "en régler le prix selon les modalités ci-après.",
  },
  {
    title: "Entrée en vigueur",
    body:
      "Le contrat entre en vigueur à la signature du devis par le client et, le cas échéant, à " +
      "réception de l'acompte prévu. Les prestations d'abonnement débutent à la mise en ligne du " +
      "site ou à la date convenue entre les parties.",
  },
  {
    title: "Prix",
    body:
      "Les prestations ponctuelles décrites dans le devis sont dues pour un montant de " +
      "{{montantPonctuel}} hors TVA. Les prestations récurrentes de maintenance, hébergement, " +
      "gestion du nom de domaine et maintenance serveur sont facturées à hauteur de " +
      "{{montantMensuel}} par mois hors TVA. Ces montants sont fermes et acquis au prestataire " +
      "dès la signature du présent contrat.",
  },
  {
    title: "Paiement",
    body:
      "Le montant des prestations ponctuelles est facturé selon l'échéancier convenu au devis et " +
      "reste dû en totalité, y compris si le client renonce au projet après signature. Les " +
      "factures mensuelles sont payables d'avance, avec échéance au {{jourEcheance}} de chaque " +
      "mois. Le paiement se fait par virement bancaire sur le compte indiqué sur la facture, sauf " +
      "accord contraire entre les parties.",
  },
  {
    title: "Retard de paiement",
    body:
      "En cas de retard de paiement, un intérêt moratoire de {{interetMoratoire}} par an est dû dès " +
      "l'échéance. Le prestataire peut également envoyer un ou plusieurs rappels et, en cas de " +
      "non-paiement persistant, suspendre les prestations jusqu'à régularisation.",
  },
  {
    title: "Durée",
    body:
      "L'abonnement est conclu pour une durée minimale de {{dureeMinimale}} à compter du début des " +
      "prestations récurrentes.",
  },
  {
    title: "Résiliation",
    body:
      "Pendant la durée minimale de {{dureeMinimale}}, le contrat ne peut pas être résilié de " +
      "manière ordinaire. À la fin de cette période, il peut être résilié par l'une ou l'autre des " +
      "parties avec un préavis de {{preavis}} pour la fin d'un mois.",
  },
  {
    title: "Résiliation anticipée",
    body:
      "En cas d'arrêt anticipé du contrat par le client avant la fin de la durée minimale, les " +
      "montants déjà dus restent exigibles, y compris le solde des prestations ponctuelles. Une " +
      "indemnité raisonnable peut en outre être demandée pour couvrir les frais engagés et non " +
      "récupérables liés au service.",
  },
  {
    title: "Délais",
    body:
      "Le prestataire s'engage à réaliser les prestations dans les meilleurs délais. Les délais " +
      "éventuels communiqués restent indicatifs, sauf accord écrit contraire.",
  },
  {
    title: "Obligations du client",
    body:
      "Le client s'engage à fournir dans un délai raisonnable tous les contenus, accès et " +
      "informations nécessaires à la bonne exécution du projet. Il garantit disposer des droits sur " +
      "les éléments transmis au prestataire.",
  },
  {
    title: "Propriété intellectuelle",
    body:
      "Les droits sur le site et les créations réalisées pour le client sont transférés au client " +
      "après paiement complet de toutes les sommes dues. Les outils, méthodes, scripts génériques " +
      "et éléments préexistants du prestataire restent sa propriété.",
  },
  {
    title: "Responsabilité",
    body:
      "Le prestataire répond uniquement des dommages directs résultant d'une faute prouvée. Il ne " +
      "répond pas des dommages indirects, pertes d'exploitation, pertes de données ou interruptions " +
      "causées par des tiers, notamment l'hébergeur ou le fournisseur du nom de domaine.",
  },
  {
    title: "Confidentialité",
    body:
      "Le prestataire s'engage à traiter de manière confidentielle les informations communiquées " +
      "par le client dans le cadre de la mission.",
  },
  {
    title: "Droit applicable et for",
    body:
      "Le présent contrat est soumis au droit suisse. En cas de litige, les parties s'efforceront " +
      "d'abord de trouver une solution amiable. À défaut, les tribunaux compétents du canton de " +
      "{{canton}} seront saisis.",
  },
  {
    title: "TVA",
    body:
      "La TVA est appliquée selon les règles légales en vigueur et indiquée sur la facture.",
  },
];

/** Key of the template offered by default. */
export const DEFAULT_MODEL_KEY = "services";

export const CONTRACT_MODELS: ContractModel[] = [
  {
    key: "services",
    name: "Prestation de services (modèle Qwasar)",
    description:
      "Le contrat historique de Qompta : récapitulatif financier, 15 articles numérotés, " +
      "signatures des deux parties. Couvre le ponctuel (création) et l'abonnement.",
    tags: ["Par défaut", "Ponctuel + abonnement"],
    blocks: [
      { type: "commitments" },
      ...QWASAR_ARTICLES.map((a) => article(a.title, a.body)),
      SIGNATURES,
    ],
  },
  {
    key: "subscription",
    name: "Abonnement / maintenance",
    description:
      "Service récurrent (hébergement, maintenance, support) : prestations incluses, niveaux " +
      "de service, reconduction tacite et résiliation.",
    tags: ["Récurrent", "Niveaux de service"],
    blocks: [
      PARTIES,
      { type: "commitments" },
      article(
        "Objet",
        "{{prestataire}} fournit à {{client}} les prestations récurrentes décrites ci-après " +
          "({{objet}}), dès le {{dateDebut}}.",
      ),
      {
        type: "list",
        title: "Prestations incluses",
        intro: "L'abonnement comprend :",
        items: [
          "l'hébergement et la supervision du service ;",
          "les mises à jour de sécurité et correctives ;",
          "la sauvegarde régulière des données ;",
          "le support par e-mail les jours ouvrables.",
        ],
        style: "bullet",
        numbered: true,
      },
      {
        type: "table",
        title: "Niveaux de service",
        headers: ["Situation", "Délai de prise en charge"],
        rows: [
          { label: "Service interrompu", value: "4 heures ouvrables" },
          { label: "Fonction dégradée", value: "1 jour ouvrable" },
          { label: "Demande ou question", value: "3 jours ouvrables" },
        ],
        numbered: true,
      },
      {
        type: "list",
        title: "Prestations non comprises",
        intro: "Sont facturés en sus, sur devis :",
        items: [
          "les nouvelles fonctionnalités et refontes ;",
          "les interventions consécutives à une modification faite par le client ou un tiers ;",
          "la formation au-delà de la prise en main initiale.",
        ],
        style: "bullet",
        numbered: true,
      },
      article(
        "Prix et facturation",
        "L'abonnement est facturé {{montantMensuel}} par mois hors TVA, payable d'avance au " +
          "{{jourEcheance}} de chaque mois. En cas de retard, un intérêt moratoire de " +
          "{{interetMoratoire}} l'an est dû dès l'échéance (art. 104 CO).",
      ),
      article(
        "Durée et reconduction",
        "Le contrat est conclu pour une durée minimale de {{dureeMinimale}}. Il se renouvelle " +
          "ensuite tacitement de mois en mois, sauf résiliation moyennant un préavis de " +
          "{{preavis}} pour la fin d'un mois.",
      ),
      article(
        "Suspension",
        "En cas de non-paiement persistant après rappel, le prestataire peut suspendre le " +
          "service jusqu'à régularisation, sans que le client puisse prétendre à une indemnité.",
      ),
      article(
        "Responsabilité",
        "Le prestataire répond des dommages directs causés par une faute prouvée, à concurrence " +
          "des montants encaissés au titre des douze derniers mois. Toute responsabilité pour les " +
          "dommages indirects, pertes de données ou de gain est exclue dans les limites de la loi.",
      ),
      FOR_JURIDIQUE,
      SIGNATURES,
    ],
  },
  {
    key: "mandate",
    name: "Mandat (art. 394 ss CO)",
    description:
      "Conseil, accompagnement, gestion : le mandataire doit une activité diligente, pas un " +
      "résultat. Honoraires au temps passé, résiliation possible en tout temps.",
    tags: ["Conseil", "Honoraires"],
    blocks: [
      PARTIES,
      article(
        "Objet du mandat",
        "{{client}} confie à {{prestataire}} le mandat suivant : {{objet}}. Le mandataire " +
          "s'engage à l'exécuter avec diligence et fidélité (art. 398 CO) ; il ne garantit pas " +
          "un résultat déterminé.",
      ),
      {
        type: "table",
        title: "Honoraires",
        headers: ["Prestation", "Tarif (hors TVA)"],
        rows: [
          { label: "Conseil et analyse", value: "CHF … / heure" },
          { label: "Rédaction et suivi", value: "CHF … / heure" },
          { label: "Déplacements", value: "Temps de trajet au tarif horaire" },
        ],
        numbered: true,
      },
      article(
        "Frais et débours",
        "Les frais engagés dans l'intérêt du mandant (déplacements, émoluments, frais de tiers) " +
          "lui sont refacturés au prix coûtant, sur justificatif (art. 402 CO).",
      ),
      article(
        "Facturation",
        "Les honoraires sont facturés mensuellement sur la base d'un relevé des heures, payables " +
          "à 30 jours. Un intérêt moratoire de {{interetMoratoire}} l'an est dû dès l'échéance.",
      ),
      article(
        "Information et reddition de comptes",
        "Le mandataire renseigne le mandant sur l'avancement du mandat à sa demande et lui rend " +
          "compte de sa gestion (art. 400 CO).",
      ),
      article(
        "Résiliation",
        "Chaque partie peut résilier le mandat en tout temps (art. 404 CO). Les prestations " +
          "effectuées jusqu'à la résiliation restent dues ; la partie qui résilie en temps " +
          "inopportun indemnise l'autre du dommage causé.",
      ),
      article(
        "Confidentialité",
        "Le mandataire garde le secret sur toutes les informations dont il a connaissance dans " +
          "le cadre du mandat, pendant et après son exécution.",
      ),
      FOR_JURIDIQUE,
      SIGNATURES,
    ],
  },
  {
    key: "work",
    name: "Contrat d'entreprise au forfait (art. 363 ss CO)",
    description:
      "Un ouvrage livré contre un prix forfaitaire : cahier des charges, échéancier, " +
      "réception et garantie des défauts. Idéal pour la création d'un site ou d'une application.",
    tags: ["Projet", "Prix forfaitaire"],
    blocks: [
      PARTIES,
      { type: "commitments" },
      article(
        "Objet",
        "{{prestataire}} s'engage à réaliser pour {{client}} l'ouvrage suivant : {{objet}}, " +
          "conformément au cahier des charges ci-dessous et au devis signé, qui fait partie " +
          "intégrante du contrat.",
      ),
      {
        type: "list",
        title: "Cahier des charges",
        intro: "L'ouvrage comprend :",
        items: ["…", "…", "…"],
        style: "number",
        numbered: true,
      },
      article(
        "Prix forfaitaire",
        "L'ouvrage est réalisé pour le prix forfaitaire de {{montantPonctuel}} hors TVA. Ce prix " +
          "est ferme : il ne varie ni en fonction du travail effectivement nécessaire, ni des " +
          "dépenses engagées (art. 373 CO). Toute demande hors cahier des charges fait l'objet " +
          "d'un avenant.",
      ),
      {
        type: "table",
        title: "Échéancier de paiement",
        headers: ["Étape", "Part du prix"],
        rows: [
          { label: "À la signature (acompte)", value: "30 %" },
          { label: "À la validation de la maquette", value: "30 %" },
          { label: "À la réception de l'ouvrage", value: "40 %" },
        ],
        numbered: true,
      },
      article(
        "Délais",
        "Le prestataire livre l'ouvrage dans le délai convenu au devis. Ce délai est prolongé " +
          "d'autant lorsque le client tarde à fournir les contenus, accès ou validations " +
          "nécessaires.",
      ),
      article(
        "Réception et vérification",
        "Le client vérifie l'ouvrage dès sa livraison et signale les défauts dans les 10 jours " +
          "(art. 367 CO). Passé ce délai sans avis, l'ouvrage est réputé accepté (art. 370 CO).",
      ),
      article(
        "Garantie des défauts",
        "En cas de défaut signalé à temps, le prestataire le corrige gratuitement dans un délai " +
          "raisonnable (art. 368 CO). Les droits du client se prescrivent par deux ans dès la " +
          "réception (art. 371 CO).",
      ),
      article(
        "Propriété intellectuelle",
        "Les droits d'utilisation de l'ouvrage passent au client après paiement complet du prix. " +
          "Les outils, bibliothèques et savoir-faire préexistants du prestataire restent sa " +
          "propriété.",
      ),
      FOR_JURIDIQUE,
      SIGNATURES,
    ],
  },
  {
    key: "nda",
    name: "Accord de confidentialité (NDA)",
    description:
      "Protège les informations échangées avant ou pendant une collaboration : définition, " +
      "exceptions, durée, restitution et peine conventionnelle.",
    tags: ["Confidentialité", "Réciproque"],
    blocks: [
      PARTIES,
      {
        type: "text",
        body:
          "Les parties envisagent une collaboration portant sur {{objet}} et doivent, à cette " +
          "fin, se communiquer des informations confidentielles. Elles conviennent de ce qui suit.",
      },
      article(
        "Informations confidentielles",
        "Sont confidentielles toutes les informations, sous quelque forme que ce soit, " +
          "communiquées par une partie à l'autre : données commerciales, financières, " +
          "techniques, clients, codes sources et savoir-faire.",
      ),
      article(
        "Obligations",
        "La partie qui reçoit une information confidentielle s'engage à ne l'utiliser que pour " +
          "la collaboration envisagée, à ne la divulguer qu'aux personnes qui ont besoin de la " +
          "connaître et qui sont tenues au même secret, et à la protéger comme ses propres " +
          "informations.",
      ),
      {
        type: "list",
        title: "Exceptions",
        intro: "L'obligation de confidentialité ne s'applique pas aux informations :",
        items: [
          "déjà publiques, ou qui le deviennent sans faute de la partie qui les reçoit ;",
          "déjà connues de celle-ci avant leur communication ;",
          "reçues légitimement d'un tiers non tenu au secret ;",
          "dont la divulgation est exigée par la loi ou une autorité.",
        ],
        style: "letter",
        numbered: true,
      },
      article(
        "Durée",
        "Le présent accord entre en vigueur à sa signature. L'obligation de confidentialité " +
          "subsiste cinq ans après la fin de la collaboration.",
      ),
      article(
        "Restitution",
        "Sur demande, chaque partie restitue ou détruit les informations confidentielles reçues " +
          "et leurs copies, et le confirme par écrit.",
      ),
      {
        type: "callout",
        title: "Peine conventionnelle",
        body:
          "Toute violation du présent accord entraîne le paiement d'une peine conventionnelle de " +
          "CHF … par cas (art. 160 CO), sans préjudice de dommages-intérêts supplémentaires.",
      },
      FOR_JURIDIQUE,
      { ...SIGNATURES, providerTitle: "Pour {{prestataire}}", clientTitle: "Pour {{client}}", clientMention: "Lu et approuvé" } as ContractBlockDraft,
    ],
  },
  {
    key: "freelance",
    name: "Sous-traitance / freelance",
    description:
      "Collaboration avec un indépendant : rémunération, facturation, cession des droits, " +
      "non-sollicitation. Distingue clairement la mission d'un contrat de travail.",
    tags: ["Indépendant", "Cession de droits"],
    blocks: [
      PARTIES,
      article(
        "Objet",
        "{{client}} confie à {{prestataire}}, qui l'accepte, la mission suivante : {{objet}}.",
      ),
      article(
        "Indépendance",
        "Le prestataire exerce en toute indépendance, sans lien de subordination : il organise " +
          "librement son travail et ses horaires. Il est seul responsable de ses assurances " +
          "sociales en tant qu'indépendant (AVS/AI/APG). Le présent contrat n'est pas un " +
          "contrat de travail.",
      ),
      {
        type: "table",
        title: "Rémunération",
        headers: ["Prestation", "Tarif (hors TVA)"],
        rows: [
          { label: "Journée de travail", value: "CHF …" },
          { label: "Demi-journée", value: "CHF …" },
        ],
        numbered: true,
      },
      article(
        "Facturation",
        "Le prestataire facture ses prestations à la fin de chaque mois, avec le relevé des " +
          "journées effectuées. Les factures sont payables à 30 jours.",
      ),
      article(
        "Cession des droits",
        "Les droits sur les travaux réalisés dans le cadre de la mission sont cédés au client " +
          "au fur et à mesure de leur paiement, pour tous les usages et sans limite de durée.",
      ),
      article(
        "Confidentialité",
        "Le prestataire garde le secret sur les informations du client et de ses clients, " +
          "pendant la mission et après sa fin.",
      ),
      article(
        "Non-sollicitation",
        "Pendant la mission et les douze mois qui suivent, aucune partie ne démarche " +
          "directement les clients ou collaborateurs de l'autre rencontrés dans ce cadre.",
      ),
      article(
        "Durée et résiliation",
        "Le contrat court dès le {{dateDebut}}. Chaque partie peut y mettre fin moyennant un " +
          "préavis de {{preavis}} ; les prestations effectuées restent dues.",
      ),
      FOR_JURIDIQUE,
      { ...SIGNATURES, providerTitle: "Le Prestataire", clientTitle: "Le Mandant" } as ContractBlockDraft,
    ],
  },
  {
    key: "amendment",
    name: "Avenant à un contrat",
    description:
      "Modifie un contrat déjà signé (un contrat signé n'est plus modifiable dans Qompta) : " +
      "tableau des modifications, le reste demeure inchangé.",
    tags: ["Modification", "Contrat signé"],
    blocks: [
      PARTIES,
      {
        type: "text",
        body:
          "Les parties sont liées par un contrat portant sur {{objet}}. Elles conviennent de le " +
          "modifier par le présent avenant.",
      },
      {
        type: "table",
        title: "Modifications",
        headers: ["Article concerné", "Nouvelle teneur"],
        rows: [{ label: "Art. …", value: "…" }],
        numbered: true,
      },
      article(
        "Autres dispositions",
        "Toutes les dispositions du contrat qui ne sont pas modifiées par le présent avenant " +
          "demeurent inchangées et pleinement applicables.",
      ),
      article("Entrée en vigueur", "Le présent avenant entre en vigueur le {{dateDebut}}."),
      SIGNATURES,
    ],
  },
  {
    key: "blank",
    name: "Structure libre",
    description:
      "Les deux parties et le bloc de signatures, rien d'autre : construisez le contrat " +
      "section par section.",
    tags: ["Vierge"],
    blocks: [PARTIES, article("Objet", ""), SIGNATURES],
  },
];

export function findModel(key: string | null | undefined): ContractModel {
  return CONTRACT_MODELS.find((m) => m.key === key) ?? CONTRACT_MODELS[0];
}
