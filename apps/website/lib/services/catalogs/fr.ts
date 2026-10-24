/**
 * [INPUT]: ServiceCatalog, publication-stage content and verified hosted AI provider/storage boundaries.
 * [OUTPUT]: Localized service, billing and policy copy.
 * [POS]: lib/services/catalogs; interpolated by the shared catalog loader.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ServiceCatalog } from '../types'

export default {
  "mobile": {
    "q": "Une app iPhone est-elle disponible ?",
    "a": "Pas encore. Le téléchargement public prend en charge macOS 14+ Apple Silicon et Windows 11 x64. Copiez le lien sur votre téléphone pour l’ouvrir sur votre ordinateur. Les futurs achats Apple seront gérés chez Apple ; aucun achat iPhone ni téléchargement App Store n’est disponible ici."
  },
  "navPricing": "Tarifs",
  "meta": {
    "title": "Tarifs Goalloom — outils locaux gratuits, Plus facultatif",
    "description": "Gardez gratuitement tâches locales, historique, sauvegardes et votre clé IA. Découvrez le futur Plus, son essai de huit jours, la synchronisation chiffrée et l’IA intégrée."
  },
  "heading": "Vos outils locaux restent gratuits.",
  "intro": "Choisissez le cloud quand il vous aide. Vos tâches, votre historique et vos sauvegardes peuvent rester sur votre appareil.",
  "eyebrow": "Local gratuit · Cloud facultatif",
  "free": "Free",
  "plus": "Plus",
  "local": "Sans compte pour le travail local",
  "comingSoon": "Bientôt disponible",
  "availability": "Voir la disponibilité",
  "download": "Télécharger gratuitement",
  "details": "Voir les offres",
  "billingCycle": "Cycle de facturation",
  "monthly": "Mensuel",
  "yearly": "Annuel",
  "perMonth": "/ mois",
  "perYear": "/ an",
  "annualCharge": "{annual} facturés une fois par an ; il ne s’agit pas d’un prélèvement mensuel.",
  "freeFeatures": [
    "Tâches, objectifs et historique locaux",
    "Sauvegardes, import et export locaux",
    "Votre propre clé de fournisseur IA (BYOK)",
    "Aucun achat ni compte requis en local"
  ],
  "plusFeatures": [
    "Synchronisation chiffrée et IA intégrée dans une offre",
    "Un essai par compte partagé entre appareils",
    "Fonctions locales et BYOK conservés après expiration",
    "Usage raisonnable et protection, sans crédits IA"
  ],
  "homePricing": {
    "title": "La synchronisation payante, à votre choix.",
    "body": "Les fonctions locales restent gratuites. Plus ajoute la synchronisation chiffrée de bout en bout et l’IA intégrée.",
    "freeDescription": "Organisez vos journées sur votre propre appareil.",
    "freePeriod": "Gratuit pour toujours",
    "freeBilling": "Sans compte ni abonnement",
    "freeIncludes": "Votre espace local complet",
    "freeFeatures": [
      "Tableaux d’objectifs et liens entre tâches",
      "Utilisation hors ligne et données locales",
      "Sauvegardes locales, import et export",
      "Utilisez votre propre clé API d’IA"
    ],
    "byokInfoLabel": "À propos des frais du fournisseur du modèle",
    "byokNote": "Le fournisseur du modèle facture séparément.",
    "annualSavings": "Économisez {amount}/an (≈ {percent})",
    "tryNow": "Essayer maintenant",
    "plusIncludes": "Toutes les fonctions Free, plus",
    "plusFeatures": [
      {
        "title": "Synchronisation chiffrée de bout en bout",
        "description": "Synchronisez objectifs et tâches entre vos appareils.",
        "id": "sync"
      },
      {
        "title": "IA intégrée",
        "description": "Aucune clé API personnelle nécessaire.",
        "id": "ai"
      }
    ],
    "encryptionNote": "Le chiffrement de bout en bout protège la synchronisation, pas le traitement par l’IA.",
    "encryptionInfoLabel": "À propos de l’IA et du chiffrement de synchronisation"
  },
  "summaryBody": "Le travail local et BYOK restent gratuits. Le futur Plus réunit synchronisation chiffrée et IA intégrée. Le téléchargement actuel et les futurs services ont des disponibilités distinctes.",
  "statusTitle": "Plus n’est pas encore ouvert",
  "statusBody": "Ni achat ni activation d’essai ne sont disponibles. Le téléchargement {version} reste gratuit avec votre clé IA. L’IA hébergée est en test limité avec authentification et absente de ce client public. Cette page ne change pas l’accès actuel à la synchronisation.",
  "support": "Assistance privée",
  "supportBody": "Pour facturation, confidentialité, suppression ou compte, écrivez-nous. Ne publiez ni mots de passe, ni clés, ni tâches ou données de paiement dans les tickets publics.",
  "technical": "Questions techniques sur GitHub",
  "manageTitle": "Gérez l’achat d’origine",
  "manageBody": "Ce site ne vend ni ne gère encore d’abonnement. À l’ouverture, utilisez le canal d’origine ; restaurer un achat ne crée pas un nouvel essai.",
  "stripeManage": "Web : gestion Goalloom pour annuler ou changer le prochain cycle. Le portail Stripe vérifié gère moyens de paiement et factures compatibles ; il n’est pas l’unique voie d’annulation.",
  "appleManage": "Futur iPhone : gestion dans les abonnements Apple. Supprimer le compte Goalloom n’annule pas Apple. L’app iPhone n’est pas publiée.",
  "terms": "Conditions du service",
  "privacy": "Confidentialité",
  "faqTitle": "Questions sur la facturation",
  "faqManageQuestion": "Comment gérer mon abonnement ?",
  "faq": [
    {
      "q": "Qu’est-ce qui reste gratuit ?",
      "a": "Tâches locales, historique, sauvegardes, import/export et BYOK restent gratuits. Votre fournisseur peut facturer votre clé. Plus est facultatif et ne limite pas vos tâches locales.",
      "id": "free"
    },
    {
      "q": "Comment démarre l’essai ?",
      "a": "À l’ouverture, une action explicite lancera un essai de {trialDays} jours ({trialHours} heures), une fois par compte. Sans carte ni débit automatique. Télécharger, se connecter et voir les offres ne le démarrent pas. L’activation de l’essai n’est pas encore disponible.",
      "id": "trial"
    },
    {
      "q": "Et si j’achète avant la fin ?",
      "a": "Un achat vérifié commence immédiatement le service payant sans crédit ni prolongation de l’essai. Un remboursement ne restaure ni ne redonne l’essai. Annulation, échec ou attente conserve l’échéance initiale.",
      "id": "purchase"
    },
    {
      "q": "Plus se renouvelle-t-il automatiquement ?",
      "a": "Au lancement, renouvellement automatique jusqu’à annulation dans le canal d’origine ; accès jusqu’à la fin payée. Les deux changements mensuel/annuel prennent effet à la prochaine échéance sans ajustement immédiat ni prorata. Désinstaller ou se déconnecter n’annule pas. Annuler ne rembourse ni ne supprime les données cloud. L’essai ne devient pas seul payant.",
      "id": "renewal"
    },
    {
      "q": "Que deviennent les données à l’expiration ?",
      "a": "La politique de lancement conserve les copies cloud {retentionDays} jours après tout essai, paiement et grâce valides. La récupération crée une copie locale indépendante et exige une autorisation du compte et les données de déchiffrement. Elle ferme à l’échéance ; l’effacement en ligne finit sous {onlineDeleteDays} jours supplémentaires. Aucun achat tardif ne restaure la copie. Ces services ne sont pas encore disponibles. Le local et BYOK restent disponibles.",
      "id": "expiry"
    },
    {
      "q": "L’IA est-elle illimitée ou chiffrée de bout en bout ?",
      "a": "BYOK reste disponible. L’IA intégrée exige connexion, choix explicite et consentement au contexte envoyé. Goalloom passe par OpenRouter vers TypeSafe/Jev, DeepInfra pour les brouillons et bilans, et DeepSeek pour réécrire les notes. DeepSeek peut conserver le contenu et l’utiliser pour l’entraînement. L’IA est distincte du chiffrement de synchronisation. Aucune IA ni capacité illimitée n’est promise. L’IA hébergée a des protections, sans crédits ni dépassement facturé automatiquement.",
      "id": "ai"
    },
    {
      "q": "Compte, mot de passe de synchronisation et paiement ?",
      "a": "Le compte établit l’identité ; le mot de passe déchiffre ; les futurs droits autorisent les services cloud. Ils sont distincts. Le client public conserve sa synchronisation facultative ; cette page n’ajoute pas de paiement obligatoire.",
      "id": "account"
    },
    {
      "q": "Puis-je demander un remboursement ?",
      "a": "Ni paiement ni temps inutilisé remboursés, sauf obligation légale ou de plateforme. Doublon, erreur et service non fourni ont une voie privée. Apple décide ses remboursements. Essai ou activation n’annulent pas les droits de rétractation. Aucun nouvel essai ni effacement local automatique. Les droits légaux restent acquis.",
      "id": "refunds"
    },
    {
      "q": "Quand change le cycle mensuel/annuel ?",
      "a": "Dans les deux sens au prochain renouvellement. Prix et période actuels inchangés, sans ajustement ni prorata. Annuler empêche le changement ; à la reprise, vérifiez cycle et montant.",
      "id": "changes"
    },
    {
      "q": "Et si le renouvellement échoue ?",
      "a": "Seul l’échec du renouvellement automatique d’un abonnement payé donne {graceDays} jours de Plus à partir de l’échéance du renouvellement initial. Pas le premier paiement, la fin d’essai ou l’expiration après annulation. Ensuite le web arrête nouvelles tentatives et renouvellement ; Apple peut continuer selon ses règles. Sans autre droit ensuite, les écritures cloud et l’IA cessent. Les paiements en cours doivent être vérifiés.",
      "id": "grace"
    }
  ],
  "billing": {
    "title": "Facturation Goalloom",
    "description": "Continuez un achat Goalloom ou vérifiez son état en sécurité, avec assistance et téléchargement gratuit tant que la facturation n’est pas ouverte.",
    "continueTitle": "Continuer avec Goalloom",
    "returnTitle": "Vérifier votre achat",
    "states": {
      "unavailable": "La facturation n’est pas encore disponible",
      "invalid": "Ce lien ne peut pas être vérifié",
      "signedOut": "Connectez-vous avant de continuer",
      "cancelled": "L’achat n’est pas confirmé",
      "failed": "L’achat n’a pas abouti",
      "pending": "En attente d’un état vérifié",
      "confirmed": "Le service a été vérifié",
      "appClosed": "Continuez dans l’application Goalloom",
      "offline": "Vous êtes hors ligne"
    },
    "explanation": "Revenez dans Goalloom et consultez votre abonnement avec le compte utilisé pour lancer l’achat.",
    "check": "Vérifier la connexion",
    "openApp": "Revenir dans Goalloom",
    "manual": "Si Goalloom ne s’ouvre pas, ouvrez l’application et vérifiez l’achat initial dans les paramètres de facturation. Ne rachetez pas. Un lien expiré ou une vérification hors connexion n’annule pas un paiement.",
    "back": "Retour aux offres",
    "noScript": "La facturation exige l’application compatible et un backend vérifié. Sans JavaScript, vous pouvez lire, télécharger et contacter l’assistance."
  },
  "legal": {
    "updated": "En vigueur et dernière mise à jour : 23 octobre 2026",
    "privacyIntro": "Goalloom est exploité par {operator}. Cette politique couvre l’app officielle, les services hébergés facultatifs et www.goalloom.com. Le local fonctionne sans compte ; les versions auto-hébergées peuvent avoir un autre opérateur.",
    "termsIntro": "Ces conditions couvrent le site officiel et les services hébergés facultatifs. {operator} exploite le web et ses abonnements ; Stripe traite les paiements web. Les achats Apple sont fournis et réglés selon le vendeur affiché sur la page et le reçu App Store et les règles de plateforme. Les licences libres du logiciel s’appliquent séparément et restent intactes.",
    "accountTitle": "Connexion Apple / Google et compte",
    "account": "Apple ou Google et Supabase traitent identifiants, adresse e-mail, profil fourni et sessions. La connexion sert aussi à l’IA facultative ; elle n’autorise pas à elle seule envoi, activation IA, essai ou paiement. Nous ne recevons pas votre mot de passe Apple ou Google.",
    "hosted": [
      "BYOK utilise votre clé OpenRouter ou Vercel AI Gateway. Dans les clients compatibles, l’IA hébergée requiert choix explicite, connexion et consentement lié au compte avant l’envoi du contexte par Goalloom et OpenRouter. TypeSafe/Jev traite la saisie intelligente, DeepInfra les brouillons et bilans, et DeepSeek exécute DeepSeek V4.1 Flash 1017 pour réécrire les notes. DeepSeek peut conserver le contenu envoyé et l’utiliser pour entraîner ses modèles. Le client public {version} n’intègre pas cette source. Les fournisseurs traitent un contexte lisible, distinct du chiffrement de synchronisation.",
      "Goalloom traite le contenu IA dans la requête initiale sans le conserver sur le serveur. Les résultats sont renvoyés une fois et ne peuvent plus être téléchargés ; seules les métadonnées nécessaires d’appels, de coûts et de sécurité sont conservées. Supprimer l’ancien cache chiffré ne prouve pas l’effacement physique immédiat des journaux, réplicas ou sauvegardes.",
      "L’appareil peut garder brouillons et résumés non adoptés ainsi que leurs empreintes dans des caches locaux bornés, même après déconnexion. Leurs limites diffèrent de celles des fournisseurs. Conservation et entraînement suivent les politiques des fournisseurs ; aucune rétention zéro générale n’est promise."
    ],
    "paymentsTitle": "Paiements et abonnements",
    "payments": [
      "Plus payant et le paiement web ne sont pas lancés. Stripe est prévu pour le web, RevenueCat pour agréger les faits de paiement vérifiés et Apple pour les futurs achats iPhone. Ces pages ne chargent aucun SDK ni aucune demande de paiement.",
      "À l’ouverture d’un canal, ses prestataires pourront traiter moyens de paiement, identifiants de transaction/abonnement, origine, montants, devise, périodes et liens de compte nécessaires. Les métadonnées de paiement ne doivent contenir ni tâches, ni prompts, ni mot de passe de synchronisation ou clés. Nous ne prétendons pas qu’aucune donnée de paiement ne passe par Goalloom."
    ],
    "retention": "La politique Plus définitive prévoit {retentionDays} jours après tous les droits d’essai, paiement et grâce. Récupération fermée à l’échéance, effacement en ligne sous {onlineDeleteDays} jours supplémentaires ; aucun achat tardif ne restaure l’ancienne copie. Suppression explicite : accès coupé dès confirmation et effacement sous {onlineDeleteDays} jours sans délai ordinaire. Sauvegardes isolées expirées sous {backupDays} jours ensuite. Fonctions non lancées ; copies locales et IA suivent leurs règles propres.",
    "paidTitle": "Futur service Plus — pas encore en vente",
    "paid": [
      "Local et BYOK restent gratuits. Plus prévoit synchronisation et IA à {monthly} mensuels ou {annual} une fois par an, taxes à collecter incluses. Ni offre synchronisation seule, promotion initiale ou dépassement facturé automatiquement.",
      "Un essai par compte de {trialDays} jours ({trialHours} heures) dès activation, sans carte ni débit automatique. Achat confirmé : essai restant consommé, sans restauration après remboursement. Échec ou attente conserve l’échéance.",
      "Au lancement, renouvellement jusqu’à annulation en origine et accès jusqu’à la fin payée. Cycle modifié à la prochaine échéance. Pas de remboursement des paiements et temps inutilisé sauf loi, plateforme et recours pour erreur ou service décrits ci-dessous."
    ],
    "sources": "Apple/Google assurent la connexion ; Supabase, compte et synchronisation ; Vercel, hébergement ; GitHub, versions de bureau. OpenRouter et les fournisseurs sélectionnés traitent l’IA. Stripe, RevenueCat et Apple sont prévus pour paiement/vérification, sans SDK actif sur ces pages.",
    "support": "Contactez l’adresse privée pour facturation, confidentialité, compte ou suppression. Ne publiez pas de données personnelles dans GitHub. Nous pouvons vérifier votre identité ; n’envoyez ni mots de passe, secrets de synchronisation, clés ou données de paiement complètes."
  },
  "policy": {
    "sections": [
      {
        "id": "free",
        "title": "Fonctions gratuites et Plus",
        "paragraphs": [
          "Tâches locales, historique, sauvegardes, import et export restent gratuits sans Plus. Vous pouvez utiliser votre clé IA et payer directement son fournisseur.",
          "Plus réunit synchronisation chiffrée et IA intégrée ; les deux cycles offrent le même service. Acheter, se connecter ou démarrer l’essai ne téléverse rien et n’active pas l’IA. Configuration de synchronisation et envoi IA nécessitent vos actions et votre consentement."
        ]
      },
      {
        "id": "prices",
        "title": "Prix, taxes et renouvellement",
        "paragraphs": [
          "La facturation web est de {monthly} par mois ou {annual} prélevés une fois par an. Les prix incluent les taxes applicables que nous devons collecter, sans ajout au prix affiché. Votre banque peut facturer conversion ou frais transfrontaliers séparément.",
          "Devise, prix local et taxes Apple figurent dans la confirmation App Store et peuvent différer du web. Total, cycle et renouvellement sont affichés avant achat. Le renouvellement est automatique jusqu’à annulation dans le canal d’origine. Les changements de prix suivent les obligations de notification et de consentement légales et de plateforme."
        ]
      },
      {
        "id": "trial",
        "title": "Essai gratuit de 8 jours",
        "paragraphs": [
          "Un compte admissible peut activer une seule fois {trialDays} jours ({trialHours} heures consécutives), partagés entre appareils. Télécharger, s’inscrire, se connecter, voir les offres ou ouvrir le paiement ne le démarre pas.",
          "Aucun moyen de paiement requis, aucun abonnement créé ni débit à la fin. Sans autre droit valide, synchronisation et IA intégrée s’arrêtent ; fonctions locales et BYOK restent disponibles.",
          "Un achat confirmé démarre immédiatement le service payant et termine l’essai restant sans crédit ni prolongation. Un échec ou une confirmation en attente conserve l’échéance initiale. Un remboursement ne restaure pas l’essai consommé et n’en donne pas un autre. Les droits légaux de rétractation et remboursement sont préservés."
        ]
      },
      {
        "id": "cancellation",
        "title": "Annuler le renouvellement",
        "paragraphs": [
          "Vous pouvez annuler à tout moment dans le canal d’origine. L’accès continue jusqu’à la fin de la période payée indiquée par ce canal. L’annulation ne rembourse ni ne démarre l’effacement cloud. Agissez avant le délai de traitement affiché et vérifiez le résultat. Apple indique ses délais et options.",
          "Pour le web, utilisez l’entrée de gestion de facturation Goalloom ; pour Apple, ses réglages d’abonnements. Désinstaller, se déconnecter ou désactiver la synchronisation n’annule pas."
        ]
      },
      {
        "id": "changes",
        "title": "Passer du mensuel à l’annuel",
        "paragraphs": [
          "Demandez le changement dans le canal d’origine. Dans les deux sens, il prend effet au prochain renouvellement. Prix et fin de période actuels restent identiques, sans ajustement immédiat ni remboursement au prorata. Montant futur et date sont affichés avant confirmation.",
          "Après annulation du renouvellement, le changement en attente ne s’applique pas à l’échéance initiale. Lors d’une reprise, vérifiez cycle et montant suivants. Un nouvel achat après expiration commence à la date confirmée. Aucun transfert automatique entre web et Apple ; gérez d’abord le contrat d’origine pour éviter un doublon."
        ]
      },
      {
        "id": "grace",
        "title": "Échec du renouvellement",
        "paragraphs": [
          "Si un abonnement payé ne se renouvelle pas à cause du paiement, il reçoit {graceDays} jours de grâce à partir de l’échéance du renouvellement initial, et non d’une nouvelle tentative ou de l’ouverture de l’application. Plus reste disponible avec ses protections habituelles. Premier paiement échoué, fin d’essai et expiration après annulation sont exclus.",
          "Sans paiement ni autre droit valide à la fin, synchronisation et IA sont suspendues ; local et BYOK continuent. Le web arrête les nouvelles tentatives automatiques et les renouvellements futurs ; les paiements en cours doivent être rapprochés. Apple peut continuer selon ses règles et rétablir après paiement. Annulez chez Apple si vous ne souhaitez plus de débit. L’app indique l’échéance réelle et la suite."
        ]
      },
      {
        "id": "refunds",
        "title": "Remboursements, erreurs et droits",
        "paragraphs": [
          "Sauf obligation légale ou de plateforme, aucun remboursement, y compris au prorata du temps inutilisé. Changer d’avis, oublier d’annuler, ne pas utiliser ou supprimer le compte n’ouvre pas de compensation supplémentaire.",
          "Pour doublon, erreur de facturation ou service non fourni comme convenu : {supportEmail}. Indiquez canal et commande, sans numéro de carte complet, mot de passe de synchronisation ni tâches.",
          "Les remboursements Apple se demandent à Apple, qui décide. Rétractation, remboursement et recours impératifs restent acquis. Si vous avez un droit légal de rétractation, exprimez-le clairement dans le délai applicable. L’essai ou l’activation immédiate ne valent pas renonciation automatique."
        ]
      },
      {
        "id": "disputes",
        "title": "Remboursements, litiges et accès",
        "paragraphs": [
          "Un remboursement total approuvé ou une annulation de paiement peut terminer le droit issu de cette transaction. Un remboursement partiel seul ne réduit pas la période. Une demande non approuvée n’arrête pas le service.",
          "Un litige vérifié peut suspendre les droits de la transaction concernée, avec avis ou assistance privée. Un autre abonnement valide non affecté continue. Les données locales ne sont pas effacées automatiquement. Si tous les droits cessent, les mêmes {retentionDays} jours s’appliquent. La résolution restaure les droits encore valides selon les faits vérifiés, sans nouvel essai."
        ]
      },
      {
        "id": "cloud-retention",
        "title": "Données cloud après la fin des droits",
        "paragraphs": [
          "La copie est conservée {retentionDays} jours après la fin de tous les essais, droits payés et grâces valides. Annuler ne démarre pas ce délai. Nouveaux envois et IA intégrée sont arrêtés. La récupération limitée exige autorisation et mot de passe de synchronisation ou autres clés ; Goalloom ne remplace pas les clés perdues.",
          "Réactiver avant l’échéance permet de continuer avec une copie non supprimée. À {retentionDays} jours, la récupération ferme et l’effacement en ligne commence, puis finit sous {onlineDeleteDays} jours supplémentaires. Un achat après l’échéance ne restaure pas l’ancienne copie, même si l’effacement est en cours ; repartez de vos données.",
          "Expiration normale, remboursements et litiges partagent les {retentionDays} jours. Tâches, historique et sauvegardes locales que vous gardez ne sont pas supprimés.",
          "Au lancement, la récupération limitée créera une copie locale indépendante sans reprendre la synchronisation ni envoyer de modifications. Remplacer l’espace actuel exigera un choix explicite et une sauvegarde locale de protection. Se connecter ne suffit pas à déchiffrer la copie ; les données de déchiffrement nécessaires restent sur l’appareil.",
          "Au lancement, les paramètres du compte afficheront les échéances du service et de récupération et l’état de l’effacement en ligne. Les rappels nécessaires apparaîtront seulement dans Goalloom, sans interrompre l’édition locale. Ils ne prolongent aucun délai et ne sont pas envoyés par e-mail ou notifications système."
        ]
      },
      {
        "id": "deletion",
        "title": "Supprimer compte ou données cloud",
        "paragraphs": [
          "La suppression explicite ne bénéficie pas des {retentionDays} jours ordinaires. Après confirmation d’une demande valide, l’accès cloud concerné cesse immédiatement. Le contenu en ligne concerné et, si demandé, le compte sont effacés sous {onlineDeleteDays} jours. Exportez d’abord le nécessaire. Se réabonner ne restaure pas le contenu supprimé. Vous gérez les données locales.",
          "La suppression complète déclenche aussi le traitement de l’annulation du renouvellement web. Apple ne s’annule pas automatiquement : désactivez chez Apple. Vous pouvez demander la suppression immédiate sans attendre l’expiration. Supprimer seulement le cloud n’annule ni compte ni abonnement. Aucun remboursement du temps inutilisé, sauf obligation légale ou de plateforme."
        ]
      },
      {
        "id": "records",
        "title": "Conservation limitée après suppression",
        "paragraphs": [
          "Stripe ou Apple traite le paiement du canal ; RevenueCat aide à vérifier l’abonnement. Goalloom traite liens de compte, commandes, montants, devise, taxes et états nécessaires. Ni tâches, ni entrées IA ou mots de passe de synchronisation ne sont envoyés aux services de paiement/vérification. Nous ne gardons ni carte complète ni cryptogramme.",
          "Selon la politique de lancement, après suppression en ligne, les sauvegardes routinières isolées expirent sous {backupDays} jours supplémentaires maximum. Elles ne servent ni à récupérer un compte ni à continuer le service. Une restauration d’infrastructure réapplique les suppressions ; cela ne signifie pas un effacement physique immédiat du support.",
          "Commandes, factures et traces nécessaires restent {billingYears} ans après la transaction ou l’ajustement comptable lié, davantage si la loi l’exige. Les traces pseudonymisées d’essai et d’abus restent au plus {abuseDays} jours après suppression, sans tâches ni empreinte d’appareil. Les preuves nécessaires à un litige ou une obligation peuvent durer jusqu’à sa fin et l’échéance applicable.",
          "Garder ces traces ne justifie pas de conserver tout le compte et ses tâches. La confidentialité décrit séparément entrées et résultats IA ; les délais de synchronisation ne remplacent pas ces règles."
        ]
      },
      {
        "id": "ai-use",
        "title": "Usage raisonnable de l’IA et assistance",
        "paragraphs": [
          "L’IA sert aux tâches et objectifs personnels quotidiens. Revente, comptes partagés comme service, appels automatisés en masse et contournement sont interdits. Nous gardons les informations nécessaires d’usage, coût et sécurité et pouvons limiter ou suspendre le trafic anormal avec aide ou nouvelle tentative.",
          "Pas d’IA illimitée, de packs d’appels ni de dépassement facturé automatiquement. La protection IA seule ne retire pas des droits de synchronisation valides. Facturation, annulation, suppression et service : {supportEmail}."
        ]
      }
    ]
  }
} satisfies ServiceCatalog
