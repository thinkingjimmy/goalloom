/**
 * [INPUT]: LegalCatalog contract and verified desktop/website data flows.
 * [OUTPUT]: French privacy policy and terms of service.
 * [POS]: lib/legal/catalogs; substantive sections match the other four languages.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { LegalCatalog } from '../types'

export default {
  "updated": "Entrée en vigueur et dernière mise à jour : 19 octobre 2026",
  "contents": "Sur cette page",
  "contact": "Contact",
  "contactText": "Pour toute question sur la confidentialité, l’accès, la rectification, la suppression ou le service, écrivez au responsable. Nous pouvons demander les informations nécessaires pour vérifier votre identité. N’envoyez pas de mots de passe, de secrets de récupération ni de clés API.",
  "resources": "Politiques et licences associées",
  "privacy": {
    "title": "Politique de confidentialité",
    "description": "Comment Goalloom traite les données locales, la connexion Google, la synchronisation chiffrée facultative, les requêtes IA et vos choix de confidentialité.",
    "intro": "Goalloom est une application de planification privilégiant le stockage local, maintenue par Jimmy, développeur indépendant. Cette politique couvre l’application officielle, la synchronisation hébergée facultative et www.goalloom.com. Les versions modifiées ou auto-hébergées peuvent avoir d’autres responsables et pratiques.",
    "sections": [
      {
        "id": "local",
        "title": "Votre espace de travail reste sur votre appareil",
        "paragraphs": [
          "Les tâches, descriptions, objectifs, relations, paramètres de calendrier et historiques sont enregistrés dans une base SQLite locale. Les sauvegardes, exports, préférences et caches peuvent aussi rester sur l’ordinateur. Le tableau local ne nécessite pas de compte cloud.",
          "Goalloom ne transmet pas le contenu des tâches comme télémétrie produit et n’utilise pas de traceurs publicitaires. Activer la synchronisation chiffrée ne chiffre pas automatiquement la base locale, les exports ni les sauvegardes. Protégez votre appareil et les copies partagées."
        ]
      },
      {
        "id": "google",
        "title": "Connexion avec Google",
        "paragraphs": [
          "Si vous activez la synchronisation avec Google, Google et Supabase, notre fournisseur d’authentification, traitent votre identifiant Google, adresse e-mail, profil de base comme le nom et la photo fournis, ainsi que les sessions. Ces informations servent à identifier et afficher le compte, et à autoriser ses appareils et espaces. Nous ne recevons pas votre mot de passe Google.",
          "La connexion actuelle demande uniquement l’identité de base, l’adresse e-mail et le profil, sans accès à Gmail, Google Drive ou Google Calendar. Les données Google ne sont ni vendues, ni utilisées pour la publicité ou l’entraînement d’IA. Leur utilisation et transfert respectent la Google API Services User Data Policy, y compris les exigences Limited Use."
        ]
      },
      {
        "id": "sync",
        "title": "Synchronisation chiffrée facultative",
        "paragraphs": [
          "Si vous l’activez, l’appareil chiffre les charges utiles des opérations avant de les envoyer à Supabase. Le service conserve les données chiffrées et les métadonnées de compte, appareil, espace, séquence, autorisation, utilisation et temps nécessaires à la synchronisation. Le chiffrement de bout en bout protège les charges utiles, pas ces métadonnées. L’infrastructure peut aussi traiter les adresses IP et journaux de requêtes.",
          "Les appareils autorisés détiennent les clés. Les préférences synchronisées prises en charge peuvent inclure des identifiants IA chiffrés ; les exports et sauvegardes ordinaires excluent ces enregistrements. Le serveur ne reçoit ni mot de passe de synchronisation en clair ni clés privées d’appareil. La perte des identifiants nécessaires peut rendre la récupération impossible."
        ]
      },
      {
        "id": "ai",
        "title": "Fonctions IA facultatives",
        "paragraphs": [
          "L’IA utilise le fournisseur et le modèle configurés, actuellement via OpenRouter ou Vercel AI Gateway. Lorsqu’elle est activée et utilisée, l’application transmet la saisie et le contexte nécessaire : titres, descriptions, objectifs associés et résumés d’activité limités peuvent être inclus. Ces requêtes sont distinctes de la synchronisation chiffrée : le fournisseur et le service de modèle reçoivent un contexte qu’ils peuvent traiter.",
          "Votre clé API authentifie les requêtes. Nous n’utilisons pas votre contenu pour entraîner nos propres modèles. La conservation, le traitement et l’entraînement chez les fournisseurs dépendent du service et des réglages choisis. Consultez leurs politiques et n’envoyez pas d’informations que vous ne souhaitez pas leur confier."
        ]
      },
      {
        "id": "network",
        "title": "Site, aperçus et mises à jour",
        "paragraphs": [
          "Le site est hébergé par Vercel et n’installe pas de scripts publicitaires ou analytiques. Il mémorise le thème dans le stockage local du navigateur. L’infrastructure peut traiter l’IP, l’URL demandée, le navigateur, les horodatages et les journaux de sécurité pour distribuer et protéger le site.",
          "L’application peut récupérer les métadonnées et images de pages publiques pour les aperçus, et joindre l’infrastructure GitHub pour vérifier et télécharger les mises à jour. Ces destinations reçoivent les informations réseau habituelles et, pour les aperçus, l’URL demandée. Les visites de liens externes relèvent des politiques des destinations."
        ]
      },
      {
        "id": "sharing",
        "title": "Prestataires et divulgations",
        "paragraphs": [
          "Google fournit la connexion ; Supabase, l’authentification et la synchronisation ; Vercel, l’hébergement du site ; GitHub, les versions et les tickets publics. Les passerelles et modèles IA choisis traitent les requêtes IA. Ils reçoivent les données nécessaires aux activités décrites et appliquent leurs propres conditions et politiques.",
          "Nous ne vendons pas les informations personnelles et ne les partageons pas pour la publicité ciblée. Une divulgation peut être nécessaire au fonctionnement, à une obligation légale ou à la réponse aux abus et menaces. Les prestataires peuvent traiter les données dans d’autres pays. Les e-mails et informations envoyés au support servent à répondre et traiter les demandes ; les tickets GitHub publics sont visibles par autrui."
        ]
      },
      {
        "id": "retention",
        "title": "Conservation et suppression",
        "paragraphs": [
          "Les données locales et copies restent sous votre contrôle jusqu’à leur suppression. Les informations de compte et données chiffrées hébergées sont conservées pour la synchronisation jusqu’à leur suppression. Les journaux de sécurité, support et infrastructure sont conservés selon leur finalité ou les obligations légales. Les données supprimées peuvent subsister dans les sauvegardes jusqu’à leur expiration ; nous ne promettons pas l’effacement immédiat de toutes les copies.",
          "Se déconnecter, désinstaller ou révoquer Google ne supprime pas les données hébergées. Supprimer une tâche n’efface pas son historique de synchronisation, ses sauvegardes ou le compte. Pour supprimer le compte hébergé et les espaces associés, écrivez à l’adresse ci-dessous. Les copies sur d’autres appareils et vos propres sauvegardes doivent être supprimées séparément."
        ]
      },
      {
        "id": "choices",
        "title": "Vos choix et demandes",
        "paragraphs": [
          "Vous pouvez rester en mode local, désactiver l’IA, vous déconnecter, exporter, gérer les copies locales et révoquer les accès dans votre compte Google. Selon la loi applicable, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, l’opposition ou une copie portable des informations détenues, et saisir l’autorité locale de protection des données. Écrivez-nous ; le chiffrement limite ce que nous pouvons consulter ou récupérer.",
          "Goalloom ne s’adresse pas aux moins de 13 ans. Si vous pensez qu’un enfant a communiqué des informations au service hébergé, contactez-nous pour examiner la situation et traiter leur suppression si nécessaire."
        ]
      },
      {
        "id": "changes",
        "title": "Modifications de cette politique",
        "paragraphs": [
          "Nous mettrons à jour la date si les pratiques changent. Les changements importants seront expliqués sur le site ou par un avis produit approprié. Une mise à jour n’active pas automatiquement le partage facultatif et n’accorde pas de nouveaux accès."
        ]
      }
    ]
  },
  "terms": {
    "title": "Conditions d’utilisation",
    "description": "Conditions du site et des services hébergés facultatifs de Goalloom : responsabilités, IA, disponibilité et droits open source.",
    "intro": "Ces conditions s’appliquent au site officiel et aux services hébergés facultatifs maintenus par Jimmy. En les utilisant, vous acceptez ces conditions. Les licences logicielles régissent séparément le code open source.",
    "sections": [
      {
        "id": "license",
        "title": "Droits open source",
        "paragraphs": [
          "Le code client pour ordinateur et mobile, les paquets partagés et le site sont sous MIT License. Le code serveur de synchronisation du répertoire supabase est sous GNU AGPL-3.0-only. Consultez les licences du dépôt pour les droits et conditions.",
          "Ces conditions ne remplacent, ne réduisent ni ne révoquent les droits accordés par ces licences. L’auto-hébergement et les versions modifiées relèvent des licences correspondantes ; les opérateurs tiers répondent de leurs propres services."
        ]
      },
      {
        "id": "account",
        "title": "Votre compte et vos données",
        "paragraphs": [
          "Vous conservez vos droits sur vos contenus. Vous autorisez uniquement le traitement nécessaire aux fonctions choisies, décrit dans la Politique de confidentialité. Vous devez avoir le droit d’utiliser les contenus transmis.",
          "Utilisez des comptes autorisés. Protégez appareils, compte Google, mot de passe de synchronisation, éléments de récupération et clés IA. Sauvegardez les données importantes. Sans les clés ou identifiants nécessaires, la récupération des données chiffrées n’est pas garantie. Si vous ne pouvez pas accepter seul légalement, obtenez le consentement requis par la loi."
        ]
      },
      {
        "id": "use",
        "title": "Utilisation acceptable",
        "paragraphs": [
          "N’utilisez pas le service illégalement, n’accédez pas sans autorisation aux données d’autrui, ne diffusez pas de code malveillant, ne perturbez pas le service et ne contournez pas les contrôles ou limites. La recherche de sécurité ne doit pas exposer les données d’autrui ni endommager le service.",
          "Nous pouvons restreindre l’accès hébergé lorsque cela est raisonnablement nécessaire pour répondre à un abus, un risque ou une obligation légale. Votre licence open source n’est pas révoquée. Si possible et approprié, nous expliquerons la mesure ; une urgence peut exiger d’agir d’abord."
        ]
      },
      {
        "id": "optional",
        "title": "Services facultatifs et tiers",
        "paragraphs": [
          "Le tableau local ne nécessite pas de compte hébergé. La synchronisation et l’IA dépendent du réseau et de Google, Supabase, GitHub et des fournisseurs IA choisis. Leurs conditions et leur disponibilité peuvent évoluer.",
          "L’application actuellement distribuée est gratuite ; les fournisseurs IA peuvent vous facturer directement sur votre compte. Ces conditions ne créent aucun abonnement. Une future offre payante présentera prix et conditions avant votre décision d’achat."
        ]
      },
      {
        "id": "ai",
        "title": "Résultats de l’IA",
        "paragraphs": [
          "Les suggestions peuvent être erronées, incomplètes ou inadaptées. Vérifiez les plans, placements, relations et textes avant de vous y fier. Vous restez responsable des décisions et actions fondées sur ces résultats. L’IA ne remplace pas l’avis d’un professionnel qualifié."
        ]
      },
      {
        "id": "availability",
        "title": "Évolutions, sauvegardes et arrêt d’utilisation",
        "paragraphs": [
          "Nous pouvons mettre à jour le logiciel et le service, fixer des limites raisonnables ou arrêter une fonction hébergée. Aucun taux de disponibilité ni délai de récupération n’est promis. Pour un arrêt majeur prévu, nous tenterons de donner un préavis raisonnable et une possibilité d’exporter les données disponibles. Une urgence juridique ou de sécurité peut empêcher le préavis.",
          "Vous pouvez cesser l’utilisation à tout moment. La déconnexion et la désinstallation ne demandent pas la suppression cloud. Écrivez-nous pour supprimer le compte hébergé et gérez séparément fichiers et sauvegardes locaux. La politique explique conservation et suppression."
        ]
      },
      {
        "id": "warranty",
        "title": "Garanties et responsabilité",
        "paragraphs": [
          "Dans les limites de la loi, le site et les services sont fournis selon disponibilité, sans garantie de continuité, d’absence d’erreur ou d’adéquation à un besoin. Les garanties et responsabilités du logiciel open source figurent dans ses licences.",
          "Dans les limites légales, le responsable ne répond pas des pertes indirectes ou consécutives liées à l’utilisation, y compris aux pannes tierces ou identifiants perdus. Rien n’exclut une responsabilité légalement obligatoire ni ne limite les droits impératifs des consommateurs ou de confidentialité."
        ]
      },
      {
        "id": "changes",
        "title": "Modifications et questions",
        "paragraphs": [
          "Nous publierons les révisions ici avec une nouvelle date et signalerons les changements importants sur le site ou par un avis adapté. Ils ne retirent pas rétroactivement des droits existants. Contactez-nous pour toute question sur ces conditions ou le service."
        ]
      }
    ]
  }
} satisfies LegalCatalog
