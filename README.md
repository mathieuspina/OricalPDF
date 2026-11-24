# Orical PDF

Lecteur et éditeur de PDF pour Windows, pensé pour les plans (charpente, bâtiment) : annoter, mesurer, organiser les pages, imprimer à la taille
réelle, comparer deux indices, reconnaître le texte, créer et remplir des formulaires, caviarder. **100 % hors-ligne** : aucune connexion réseau,
aucune télémétrie, aucune mise à jour automatique. Interface en français. Aide intégrée : touche **F1**.

Version actuelle : **1.0.0** (historique : [CHANGELOG.md](CHANGELOG.md)).

## Fonctions

| Domaine | Ce que fait Orical PDF |
|---|---|
| Lecture | Onglets, miniatures, signets, recherche, zoom, plein écran, rotation de l'affichage |
| Annotations | Texte, modification de texte existant (par recouvrement), formes, flèches, nuages, surlignage, crayon, légende fléchée aimantée, notes, tampons, tampons techniques (silhouettes de profilés et repères de plan, sans cotes), images, signature dessinée |
| Mesure | Échelle connue ou calibrage, distances, polylignes, surfaces, angles, cotes, cercles, aimantation sur les traits du plan, export CSV |
| Pages | Rotation, déplacement, duplication, suppression, insertion, recadrage, extraction, division, numérotation ; les signets suivent les pages |
| Fusion | Plusieurs PDF en un, plages, rotation par fichier, un signet par fichier |
| Impression | Taille réelle (plans A1 / A0), marges, couleur / gris / noir et blanc, file d'attente non bloquante |
| Windows | « Ouvrir avec » pour les PDF (sans remplacer le lecteur par défaut) ; un PDF ouvert alors qu'Orical PDF tourne s'ajoute en onglet |
| Comparaison | Superposition deux couleurs, côte à côte, fondu, zones modifiées, comparaison du texte, rapport PDF |
| OCR | Français et anglais, sans réseau ; couche de texte invisible cherchable |
| Formulaires | Remplissage des champs existants ; création de champs (texte, case, radio, listes, date), ordre de tabulation, prévisualisation |
| Caviardage | Zones, recherche (mots, e-mail, téléphone, IBAN), application par rastérisation des pages, nettoyage des structures et métadonnées |
| Document | Propriétés, protection par mot de passe, optimisation, export des pages en images |
| Enregistrement | Annotations « Modifiables » (rééditables à la réouverture, PDF lisible partout) ou « Aplaties » (figées dans la page) |
| Favoris | Clic droit sur une commande du ruban : « Ajouter aux favoris » ; les favoris s'affichent dans l'onglet Accueil |

Ce que chaque fonction fait exactement, ses étapes et ses pièges : aide intégrée (F1).

## Installation

- **Installeur** `OricalPDF-Setup-x.y.z.exe` : par utilisateur, sans droits administrateur, dossier par défaut `%LOCALAPPDATA%\Programs\Orical PDF`.
  Installation silencieuse : `OricalPDF-Setup-x.y.z.exe /S` (dossier imposé : `/D=C:\Programmes\OricalPDF`, toujours en dernier).
- **Portable** `OricalPDF-Portable-x.y.z.exe` : aucun installateur.
- Données de l'utilisateur (réglages, récents, bibliothèque de tampons et signatures, échelles) : `%APPDATA%\Orical PDF`.
- Désinstallation : Paramètres Windows > Applications ; les données sont conservées sauf si la case « Supprimer aussi mes réglages et ma bibliothèque »
  est cochée (en silencieux : `/DELETEDATA=1`).
- Fichiers PDF : Orical PDF est ajouté à « Ouvrir avec », sans remplacer le lecteur par défaut (choix dans les Paramètres de Windows).
  L'icône Orical des fichiers PDF n'apparaît que pour les PDF dont l'application par défaut est Orical PDF.
- Service informatique : [docs/NOTES-INFORMATIQUE.md](docs/NOTES-INFORMATIQUE.md).

## Avertissement de Windows au premier lancement

Orical PDF n'est pas signé numériquement (un certificat de signature de code est payant, et il n'y a pas de budget pour cela pour l'instant).
Windows SmartScreen peut donc afficher « Windows a protégé votre ordinateur » au lancement de l'installeur ou de la version portable.
C'est le comportement habituel pour un logiciel non signé et peu téléchargé ; cela ne signale pas un problème détecté dans le fichier.

Pour continuer : cliquer sur **« Informations complémentaires »**, puis sur **« Exécuter quand même »**.

Pour vérifier que le fichier est bien celui publié, comparer son empreinte SHA-256 avec celle du fichier `SHA256SUMS.txt` joint à la
Release (PowerShell, dans le dossier du téléchargement) :

```powershell
Get-FileHash .\OricalPDF-Setup-1.2.1.exe -Algorithm SHA256
```

Les deux valeurs doivent être identiques (la casse des lettres ne compte pas). Si elles diffèrent, ne pas lancer le fichier et le télécharger
de nouveau depuis la page des Releases du dépôt.

## Développement

Prérequis : Windows, Node.js 20 ou plus récent. Exemple de dossier de travail : `C:\Projets\OricalPDF`.

```bash
npm install
node scripts/copy-vendor.js
npm start
```

| Commande | Rôle |
|---|---|
| `npm test` | Tests de logique (Node, sans interface) |
| `npm run test:ui` | Tests d'interface : l'application tourne hors écran, pilotée par CDP (aucune fenêtre, aucune souris système) |
| `npm run licences` | Vérifie que toutes les dépendances ont une licence permissive (jamais GPL / AGPL / LGPL) et régénère `THIRD_PARTY_LICENSES` |
| `npm run dist` | Construit l'installeur et le portable dans `dist/` (les binaires ne vont jamais dans git) |
| `npm run test:packaged` | Teste l'application construite : dépaquetée, portable, installée puis désinstallée dans un dossier temporaire |
| `npm run test:print` | Impression réelle vers l'imprimante virtuelle de test « OricalPDF Test PDF » uniquement (à la demande) |

## Architecture (résumé)

- `main.js`, `preload.js`, `print-main.js`, `app-info.js` : processus principal Electron (fenêtre, fichiers, impression, garde réseau, diagnostic).
- `src/*.js` : logique pure (UMD, testée sous Node) : modèle de document et historique (`doc-model`), géométrie des objets (`shapes`), écriture
  du PDF (`pdf-edit`, seul module qui écrit), opérations de pages (`page-ops`), signets (`outline`), mesure, numérotation, formulaires (`forms`,
  `fields`, `fields-pdf`), OCR, comparaison, caviardage (`redact*`), impression (`print-*`).
- `src/js/*.js` : interface (modules ES, un fichier par fonction) ; `src/js/annot/` : annotations ; aide intégrée : `help-content.js`.
- Aperçu et écriture partagent les mêmes primitives : ce qui est vu est ce qui est écrit.
- Bibliothèques embarquées (`vendor/`) : pdf.js (affichage), pdf-lib (écriture), tesseract.js (OCR), toutes sous licence permissive.
- Sécurité : CSP stricte (aucune ressource externe), navigation et nouvelles fenêtres bloquées, requêtes réseau bloquées et comptées.

## Licence

Orical PDF © Orical, tous droits réservés : le code est publié pour être consulté (voir `LICENSE`). Utilisation du logiciel : gratuite,
personnelle ou professionnelle, selon le contrat de licence `EULA.fr.md` (affiché par l'installeur). Confidentialité : aucune donnée collectée
ni envoyée (`POLITIQUE-CONFIDENTIALITE.md`). Composants tiers : licences permissives (MIT, Apache-2.0, BSD, ISC, OFL), texte complet dans
`THIRD_PARTY_LICENSES` et dans l'application (Réglages > À propos).

Signaler une faille de sécurité : [SECURITY.md](SECURITY.md). Signalements et suggestions : [CONTRIBUTING.md](CONTRIBUTING.md).

## Limites connues

- **Annotations** : modifiables à la réouverture seulement si le fichier a été enregistré en « Modifiable » (1.2.0 ou plus) et n'a pas été
  réécrit par un autre outil ; l'historique d'annulation repart de zéro ; dans les autres lecteurs, elles sont visibles mais font partie de la page.
- **Champs de formulaire créés** : figés après réouverture ; ils se remplissent, mais leur position et leurs propriétés ne se modifient plus.
  Pas de JavaScript (calculs, formats, boutons d'action).
- **Texte** : non éditable sur une page pivotée ; polices d'origine incorporées non réutilisables ; caractères hors jeu Windows latin
  remplacés par « ? » dans le texte ajouté.
- **Mesure** : l'échelle n'est pas lue dans le PDF (à saisir ou à calibrer) ; pas d'aimantation sur un plan scanné.
- **OCR** : écriture manuscrite mal lue ; fond gris très bruité ou taché : aucun texte reconnu ; tout caractère non latin est remplacé par « ? »
  dans la couche de texte invisible.
- **Caviardage** : les pages caviardées sont transformées en images ; aucune garantie absolue : vérifiez toujours le fichier produit dans un
  autre lecteur PDF avant de le diffuser.
- **Pages** : après une opération de pages, les liens internes et les champs du PDF d'origine ne sont pas conservés (signets et champs créés le sont).
- **Impression** sur imprimante physique ou traceur : non vérifiée au papier par les tests automatiques. En cas de feuille tournée ou coupée :
  options avancées « Orientation envoyée à l'imprimante » et « Méthode d'envoi du format » dans la boîte d'impression (la ligne « Envoi » sous
  l'aperçu indique ce qui part vers l'imprimante), et « Copier le journal d'impression » dans À propos. Traceurs dont le pilote ne donne pas de
  code de papier Windows (A1, A0) : choisir le papier par « Boîte Windows… ».
