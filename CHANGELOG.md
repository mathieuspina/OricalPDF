# Journal des versions — Orical PDF

Une ligne par fonction importante. Les dates sont celles du dépôt. Les versions 0.x sont des versions de travail.
Pour la mise à jour d'un poste, voir [RELEASING.md](RELEASING.md#mettre-à-jour-un-poste).

## 1.4.0 — en préparation
Tampons techniques pour annoter les plans (charpente, bardage, couverture, bâtiment).
- Onglet Annoter > Tampons techniques : 33 silhouettes schématiques, sans cotes ni échelle, posées d'un clic puis agrandies aux poignées
  (proportions gardées, Maj = libres), tournées, copiées, annulables comme les autres tampons ; miniatures dessinées à partir de la même géométrie.
- Profilés : IPE, IPN, HEA, HEB, HEM, UPN, UPE, cornières à ailes égales et inégales, T, tubes carré, rectangulaire et rond, plat, rond plein.
- Bardage et couverture : pannes Z, C et Sigma, lisse oméga, bac acier (trapèze), panneau sandwich.
- Repères : bulle numérotée, flèche Nord, soudures (angle, bout à bout, tout autour), cote de niveau, repère de coupe, flèche de pente, axe
  (trait mixte), perçage / boulon, tige d'ancrage, voir détail (bulle double).
- Panneau Propriétés : libellé modifiable (ex. « IPE 200 »), couleur (noir pour les profilés, rouge pour les repères par défaut),
  plein ou contour, épaisseur du trait (proportionnelle à la taille du tampon), opacité.
- Favoris : clic droit sur une miniature pour épingler un symbole dans l'onglet Accueil.

Corrections d'impression et de fermeture (jamais publiées séparément : prévues pour une 1.3.1, livrées dans la 1.4.0).
- Après une impression, fermer puis relancer Orical PDF fonctionne de nouveau : les fenêtres cachées d'impression ne gardent plus l'application
  ouverte en arrière-plan (il fallait arrêter le processus à la main). Un nouveau lancement rouvre aussi la fenêtre d'une instance restée ouverte.
- Impression en paysage : le format du papier est toujours annoncé à l'imprimante en portrait, avec l'orientation paysage indiquée à part ;
  formats usuels reconnus (A5 à A0, Letter, Legal, Tabloid) et dimensions exactes du papier annoncé par l'imprimante. Documents mêlant
  plusieurs formats : une tâche par format, chacune dans son orientation.
- Impression sur copieur : le format du papier est maintenant annoncé à l'imprimante par son code de papier Windows (A3, A4, A5, Letter,
  Legal, Tabloid, A2, ou le code du papier annoncé par l'imprimante) pour les formats usuels. Avant, il n'était annoncé que par ses dimensions,
  que de nombreux pilotes de copieurs ignorent : la feuille sortait sur le papier par défaut (A4), non réduite, coupée à droite et en bas.
- Option avancée « Méthode d'envoi du format » (Automatique, Taille personnalisée, Papier par défaut du pilote), mémorisée par imprimante ;
  la boîte d'impression affiche sous l'aperçu ce qui part vers l'imprimante (« Envoi : A3 (…, code 8), paysage »).
- Option avancée de la boîte d'impression « Orientation envoyée à l'imprimante » (Automatique, Portrait, Paysage), mémorisée par imprimante :
  pour un pilote qui tournerait mal la feuille ; ne change ni l'aperçu ni la mise en page.
- Journal d'impression (200 dernières tâches, sans nom de fichier ni chemin) : « Copier le journal d'impression » dans À propos, à joindre à un
  signalement. Il indique la méthode d'envoi demandée et appliquée, le format et l'orientation exacts envoyés, les papiers annoncés par
  l'imprimante (40 au plus) et si leur lecture a réussi ou dépassé le délai.
- Boîte d'impression : le nombre de copies revient toujours à 1 à chaque ouverture (il était mémorisé : 6 copies d'un document
  étaient reproposées pour le suivant, même après un redémarrage).

## 1.3.0 — 2026-11-22
« Spin A Doc » devient « Orical PDF » (suite Orical).
- Nouveau nom partout : fenêtre, accueil, À propos (« fait partie de la suite Orical », sous licence Orical), aide, installeur et raccourcis,
  exécutable `Orical PDF.exe`, installeurs `OricalPDF-Setup-x.y.z.exe` et `OricalPDF-Portable-x.y.z.exe`. Contrat de licence et politique de
  confidentialité : seuls le nom du produit et celui de l'éditeur changent.
- Nouveau logo (barre de titre, accueil, À propos, aide) et nouvelle icône de l'application, dessinée à chaque taille (16 à 256 px).
- Nouvelle icône des fichiers PDF, visible pour les PDF dont l'application par défaut est Orical PDF (l'installeur ne change jamais le lecteur
  par défaut).
- Intégration à Windows : « Ouvrir avec » et « Applications par défaut » au nouveau nom ; les traces de l'ancien nom sont retirées.
- Mise à jour par-dessus la 1.2.1 sans rien perdre : réglages, documents récents, bibliothèque et échelles conservés (dossier
  `%APPDATA%\Spin A Doc`, nom historique), choix « application par défaut » conservé, une seule entrée de désinstallation, raccourcis
  renommés, ancien dossier du programme remplacé. Les PDF enregistrés en « Modifiables » par les versions précédentes se rouvrent à l'identique.

*Les versions ci-dessous portaient le nom Spin A Doc (Spin A Doc devient Orical PDF en 1.3.0).*

## 1.2.1 — 2026-11-20
- Contrat de licence : retrait de la mention de brouillon (de même dans la politique de confidentialité ; texte inchangé par ailleurs).

## 1.2.0 — 2026-11-20
Annotations modifiables après réouverture.
- À l'enregistrement : « Modifiables » (le PDF reste lisible partout, Spin A Doc peut rééditer les annotations à la réouverture) ou « Aplaties »
  (figées dans la page, comme avant). Avertissement : tampons et signatures retirables. « Mémoriser mon choix » (Réglages > Annotations).
- Réouverture : annotations, mesures et échelles, numérotation et champs créés redeviennent modifiables ; restauration en arrière-plan (bandeau
  au-delà d'une seconde, « Ouvrir sans les annotations modifiables ») ; indicateur « Annotations modifiables » dans la barre d'état.
- Fichier réécrit par un autre outil, nombre de pages changé ou version plus récente : ouverture normale (annotations figées) avec un message.
- Caviardage appliqué ou métadonnées à nettoyer : toujours enregistré aplati. Fichier protégé par mot de passe : pris en charge.
- Fusion : un fichier modifiable garde ses annotations visibles, figées dans le fichier fusionné (information affichée).
- Aide : rubrique « Enregistrer : modifiable ou aplati ? ».

## 1.1.0 — 2026-11-20
Favoris.
- Clic droit sur une commande du ruban (ou touche Menu / Maj+F10) : « Ajouter aux favoris ». Les favoris s'affichent dans l'onglet Accueil,
  groupe « Favoris » (12 au plus), et restent dans leur onglet d'origine. Clic droit sur un favori : retirer, déplacer à gauche ou à droite.
- Un favori déclenche la même commande et montre le même état que le bouton d'origine (outil actif, option activée, commande indisponible).
- Favoris mémorisés d'une session à l'autre (réglages de l'application). Les listes déroulantes ne peuvent pas être ajoutées.
- Aide : rubrique « Mes favoris ».

## 1.0.2 — 2026-11-20
Mesures.
- Les textes des mesures sont toujours lisibles, jamais à l'envers, quel que soit le sens du tracé, y compris sur une page pivotée (rotation
  d'origine du PDF ou « Pivoter » de l'onglet Pages / Accueil) : distance, cote, polyligne, dX / dY ; la valeur d'une surface, d'un angle ou
  d'un cercle reste horizontale à l'écran. Même résultat à l'écran et dans le PDF enregistré.
- Cote : la valeur est toujours au-dessus de la ligne de cote, même tracée de droite à gauche ou de haut en bas.
- Distance et Cote mieux distinguées : infobulles explicites, icône propre à la Cote, rubrique d'aide « Distance ou Cote ? ».

## 1.0.1 — 2026-11-20
Petites corrections.
- À propos : la liste des licences tierces s'affiche dans l'application installée (le message « Fichier THIRD_PARTY_LICENSES introuvable »
  apparaissait à la place).
- Diagnostic : le nom du serveur des imprimantes réseau est masqué (`\\<serveur>\NomImprimante`).
- Icône redessinée pour les petites tailles : fond transparent, document et anneaux nets dans l'Explorateur et la barre des tâches (plus de
  tache sombre) ; tailles 16 à 256 px.
- La fenêtre se rouvre comme elle a été fermée : plein écran, agrandie, ou même taille et même position (position par défaut si l'écran
  n'existe plus).

## 1.0.0 — 2026-11-12
Première version publique. Lecteur et éditeur de PDF pour Windows, 100 % hors-ligne, interface en français. Fonctions
(vérifiées par les tests automatiques ; impression sur papier non vérifiée, voir « Limites connues » dans le README) :
- Lecture : onglets, miniatures, signets, recherche, zoom ; « Ouvrir avec » pour les PDF, sans remplacer le lecteur par défaut.
- Annotations : texte, modification de texte existant par recouvrement, formes, nuages, surlignage, crayon, légende fléchée, notes, tampons,
  images, signature dessinée (sans valeur juridique).
- Mesure : échelle saisie ou calibrée, distances, surfaces, angles, cotes, aimantation sur les traits du plan, export CSV.
- Pages : rotation, déplacement, duplication, suppression, insertion, recadrage, extraction, division, numérotation ; fusion de plusieurs PDF.
- Impression à la taille réelle, en couleur, en gris ou en noir et blanc, sans bloquer l'application.
- Comparaison de deux versions d'un plan (zones modifiées, texte), avec rapport PDF.
- Reconnaissance du texte (OCR) en français et en anglais, sans réseau.
- Formulaires : remplissage des champs existants et création de champs.
- Caviardage par transformation des pages en images et nettoyage des structures cachées (à vérifier dans un autre lecteur avant diffusion).
- Document : propriétés, protection par mot de passe, optimisation, export des pages en images.
- Aide intégrée (F1), fenêtre À propos, informations de diagnostic sans nom de fichier ni chemin.

Publication :
- Titulaire des droits : SpinASoft ; contrat de licence utilisateur final (EULA) affiché par l'installeur ; politique de confidentialité.
- Plus de fichier de configuration de mise à jour dans l'application (aucune mise à jour automatique).
- Licences tierces complétées (modèles de langue de l'OCR, polices, icônes) et livrées dans le dossier de l'application.
- Logiciel non signé numériquement : avertissement possible de Windows SmartScreen, vérification par empreinte SHA-256 (README, aide).
- Limites connues mises à jour (README, aide).

## 0.12.4 — 2026-11-12
- OCR : détection de l'orientation plus fiable. Une page posée de côté ou à l'envers est redressée même quand la lecture à l'endroit semble
  « presque correcte » (cas d'une page lue à 60 % de confiance, et du texte clairsemé couché, qui n'étaient pas redressés).
- OCR : les quatre sens sont comparés sur une partie de la page seulement, puis la page est relue une fois : plus rapide qu'avant sur les pages
  douteuses, aucun surcoût sur les pages droites.
- Aide : limites de la reconnaissance (manuscrit, plans peu contrastés ou clairsemés, fond gris très bruité).

## 0.12.3 — 2026-11-12
- Préparation de la publication : procédure pas à pas (RELEASING.md), empreintes SHA-256 de l'installeur et de la version portable (SHA256SUMS.txt), ce journal des versions.
- Mise à jour d'un poste documentée (nouvel installeur par-dessus l'ancien, réglages conservés) et vérifiée par un test automatique.
- OCR : trace de diagnostic de l'orientation (passes essayées, mots, confiance), sans effet sur le résultat.

## 0.12.2 — 2026-11-11
- Imprimante virtuelle retirée : « Microsoft Print to PDF », fourni avec Windows, suffit.
- Un PDF ouvert alors que Spin A Doc tourne déjà s'ajoute en onglet, même pendant le démarrage.
- Ruban : étiquettes de groupe toujours entières, libellés des boutons sur deux lignes au plus.

## 0.12.1 — 2026-11-11
- Spin A Doc s'inscrit dans « Ouvrir avec » pour les PDF, sans jamais remplacer le lecteur par défaut ; accès direct à la page « Applications par défaut » de Windows.

## 0.12.0 — 2026-11-11
- Aide intégrée (F1) avec sommaire et recherche, rubrique « Où sont les commandes ? ».
- Fenêtre À propos : version, date de construction, licences, compteur de requêtes réseau bloquées (100 % hors-ligne).
- Informations de diagnostic à copier, sans chemin ni nom de fichier.
- Ruban regroupé en 7 onglets, sans perte de commande.
- Les signets du PDF sont conservés après les opérations de pages.
- Désinstallation : case pour supprimer aussi les réglages et la bibliothèque (décochée par défaut).

## 0.11.0 — 2026-11-11
- Création de champs de formulaire (texte, case à cocher, boutons radio, liste déroulante, liste, date), écrits comme de vrais champs PDF.
- Propriétés des champs, noms uniques, duplication, alignement, ordre de tabulation, mode Prévisualiser / remplir.

## 0.10.3 — 2026-11-11
- Panneau Propriétés sans débordement, largeur réglable par le bord gauche.

## 0.10.2 — 2026-11-11
- Caviardage sûr : zones, recherche de mots et de modèles (e-mail, téléphone, IBAN), application par rasterisation des pages concernées, nettoyage du PDF et des métadonnées.
- Sorties protégées : impression, export en images, fusion, extraction et division proposent d'appliquer d'abord le caviardage.

## 0.10.1 — 2026-11-11
- Légende fléchée (texte et repère, coude, pointes, aimantation).

## 0.10.0 — 2026-11-11
- Reconnaissance de texte (OCR) hors ligne, français et anglais : couche de texte invisible, recherche et copie sur les scans.

## 0.9.1 — 2026-11-11
- Comparaison de deux documents : superposition, fondu, côte à côte, différences de texte, rapport PDF.

## 0.9.0 — 2026-11-10
- Numérotation des pages, dépôt de PDF dans les miniatures.
- Onglet Document : export en images, propriétés, optimisation, protection par mot de passe, ouverture des PDF protégés.
- Remplissage des formulaires PDF.

## 0.8.0 — 2026-11-10
- Fusion de PDF.
- Impression non bloquante (file d'attente).

## 0.7.0 — 2026-11-10
- Onglet Pages : pivoter, supprimer, extraire, réordonner, dupliquer, insérer, recadrer, diviser.

## 0.6.0 — 2026-11-10
- Impression à la taille exacte du papier (plans A0 à A4), en couleur, en gris ou en noir et blanc.
- Déplacement du document au clic molette ou avec Espace.

## 0.5.0 — 2026-11-10
- Onglet Mesure : distances, polylignes, surfaces, angles, cotes, cercles, échelle et calibrage, aimantation sur le dessin, export CSV.

## 0.4.0 — 2026-11-10
- Notes, tampons, images et signatures tracées ; bibliothèque personnelle de tampons et de signatures.

## 0.3.1 — 2026-11-09
- Outils persistants, panneaux flottants, barre de titre intégrée.
- Modification du texte existant fidèle à l'original (couleur, police, fond, inclinaison, pages pivotées).
- Versions installée et portable vérifiées automatiquement.

## 0.3.0 — 2026-11-09
- Annotations figées dans le PDF à l'enregistrement : formes (ligne, flèche, rectangle, ellipse, polygone, nuage de révision), marquage du texte (surligner, souligner, barrer) ; panneau Propriétés et panneau Annotations.

## 0.2.1 — 2026-11-09
- Corrections de l'interface (ruban, affichage page par page, boîtes de fermeture), nouveau logo.

## 0.2.0 — 2026-11-09
- Interface à ruban, onglets multi-documents, panneau latéral, accueil, réglages ; licences tierces vérifiées.

## 0.1.0 — 2026-11-09
- Première version : visionneuse PDF, ajout et remplacement de texte, documents récents, recherche.
