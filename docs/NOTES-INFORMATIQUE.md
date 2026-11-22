# Orical PDF — notes pour le service informatique

Version de référence : 1.2.1. Tout ce qui suit est vérifié dans la configuration de construction (`package.json`, section `build`, et
`build/installer.nsh`) et par le test `npm run test:packaged` (installation et désinstallation silencieuses dans un dossier temporaire).

## Ce que fait l'installeur

- Installeur NSIS **par utilisateur** (`perMachine: false`) : **aucun droit administrateur** requis, rien n'est écrit pour les autres utilisateurs.
- Dossier par défaut : `%LOCALAPPDATA%\Programs\Orical PDF` (modifiable dans l'assistant).
- Raccourcis : menu Démarrer et bureau ; entrée « Orical PDF » dans Paramètres > Applications (clé de désinstallation dans `HKCU`).
- Association `.pdf` (mesuré par `test:packaged`) : inscription dans **« Ouvrir avec » seulement**. La valeur par défaut de
  `HKCU\Software\Classes\.pdf` n'est **jamais** écrite : le lecteur PDF de l'utilisateur reste le sien. Clés écrites (dans `HKCU` pour une
  installation par utilisateur) : `Software\Classes\.pdf\OpenWithProgids` (valeur `SpinADoc.pdf`), classe `Software\Classes\SpinADoc.pdf`
  (icône des fichiers PDF `…\resources\pdf-file.ico`, commande `"…\Orical PDF.exe" "%1"`), `Software\Classes\Applications\Orical PDF.exe` (type `.pdf`),
  `Software\SpinADoc\Capabilities` et la valeur « Orical PDF » de `Software\RegisteredApplications` (page « Applications par défaut » de Windows).
  Toutes retirées à la désinstallation. Les noms techniques `SpinADoc.pdf` et `Software\SpinADoc` datent de l'ancien nom (Spin A Doc) et sont
  gardés : un choix « application par défaut » déjà fait survit à la mise à jour. La 1.3.0 retire `Applications\Spin A Doc.exe` et la valeur
  « Spin A Doc » de `RegisteredApplications` laissées par la 1.2.1.
- Icône des fichiers PDF : elle n'apparaît que pour les PDF dont l'application par défaut est Orical PDF (choix de l'utilisateur ; la version
  portable n'écrit rien). Windows garde les icônes en cache : après une installation ou une mise à jour, si l'ancienne icône reste affichée,
  `ie4uinit.exe -show` (sans droits administrateur) ou une réouverture de session la rafraîchit.
- **Aucun** service Windows, **aucune** tâche planifiée, **aucun** pilote ni imprimante ajoutés, **aucune** connexion réseau, **aucune** télémétrie, **aucune** mise à jour
  automatique. Toute tentative de requête réseau de l'application est bloquée et comptée (Réglages > À propos).

## Emplacements

| Quoi | Où |
|---|---|
| Programme | `%LOCALAPPDATA%\Programs\Orical PDF` (ou le dossier choisi) |
| Données de l'utilisateur : réglages, documents récents, bibliothèque de tampons et de signatures, échelles de mesure | `%APPDATA%\Spin A Doc` |
| Version portable | aucun fichier hors de l'exécutable, sauf les mêmes données dans `%APPDATA%\Spin A Doc` |

## Installation et désinstallation silencieuses

```bat
OricalPDF-Setup-1.2.1.exe /S
OricalPDF-Setup-1.2.1.exe /S /D=C:\Programmes\OricalPDF
```

`/D=` doit être le **dernier** argument, sans guillemets, même si le chemin contient des espaces.

```bat
"%LOCALAPPDATA%\Programs\Orical PDF\Uninstall Orical PDF.exe" /S
"%LOCALAPPDATA%\Programs\Orical PDF\Uninstall Orical PDF.exe" /S /DELETEDATA=1
```

Par défaut la désinstallation **conserve** `%APPDATA%\Spin A Doc` (retrouvé à la réinstallation). Dans l'assistant, la case « Supprimer aussi mes
réglages et ma bibliothèque » (décochée par défaut) le supprime ; en silencieux : `/DELETEDATA=1`. Une mise à jour (nouvel installeur par-dessus
l'ancien) ne supprime jamais les données.

## Si l'exécution est bloquée

- Les fichiers (installeur, version portable, application) **ne sont pas signés numériquement** : un certificat de signature de code est
  payant et il n'y a pas de budget pour cela pour l'instant. **Windows SmartScreen** peut donc afficher « Windows a protégé votre ordinateur »
  au premier lancement. C'est le comportement habituel pour un logiciel non signé et peu téléchargé ; cela ne signale pas un problème détecté
  dans le fichier. Pour continuer : « Informations complémentaires », puis « Exécuter quand même ».
- Avant de lancer le fichier, vérifier qu'il est bien celui publié : son empreinte SHA-256 (commande ci-dessous) doit être identique à celle
  de `SHA256SUMS.txt`, joint à chaque Release (la casse des lettres ne compte pas). Sinon, ne pas le lancer et le télécharger de nouveau.
- **AppLocker / listes blanches** : autoriser par chemin (`%LOCALAPPDATA%\Programs\Orical PDF\*`) ou par empreinte du fichier :

```powershell
Get-FileHash .\OricalPDF-Setup-1.2.1.exe -Algorithm SHA256
Get-FileHash "$env:LOCALAPPDATA\Programs\Orical PDF\Orical PDF.exe" -Algorithm SHA256
```

  Une règle par empreinte est à refaire à chaque nouvelle version. Chaque Release fournit `SHA256SUMS.txt` (empreintes de l'installeur et de
  la version portable) pour vérifier le fichier téléchargé.

## Mises à jour

Aucune mise à jour automatique (l'application ne se connecte jamais à Internet). Pour mettre à jour : lancer le nouvel installeur
par-dessus l'ancien, sans désinstaller (`OricalPDF-Setup-x.y.z.exe /S` en silencieux). Le programme est remplacé ; `%APPDATA%\Spin A Doc`
(réglages, récents, bibliothèque) est conservé — scénario vérifié par `npm run test:update` (profil comparé à l'octet près).

## Licences

Orical PDF © Orical, tous droits réservés ; utilisation gratuite, personnelle ou professionnelle, selon le contrat de licence
(EULA.fr.md, affiché par l'installeur et copié dans le dossier resources de l'application). Confidentialité : POLITIQUE-CONFIDENTIALITE.md
(aucune donnée collectée ni envoyée). PDF « modifiables » (1.2.0) : PDF standard ; les annotations sont un flux de contenu ajouté
à chaque page (lisible par tout lecteur), l'état de modification est un flux référencé par la clé privée `/SpinADoc` du catalogue (il ne contient que
la description des annotations : textes, positions, réglages ; aucun JavaScript, aucune pièce jointe). Composants tiers embarqués (Electron, pdf.js, pdf-lib, tesseract.js, police Inter, icônes Lucide…) : licences
permissives uniquement (MIT, Apache-2.0, BSD-2-Clause, 0BSD, ISC, OFL-1.1), vérifiées à chaque construction ; aucune licence copyleft (GPL, AGPL,
LGPL). Texte complet : fichier `THIRD_PARTY_LICENSES` et Réglages > À propos.

## Signaler un problème

Réglages > À propos > « Copier les informations de diagnostic » : version, Windows, mémoire, écrans, noms des imprimantes. Aucun nom de fichier,
chemin ni contenu de document.
