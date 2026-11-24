// Contenu de l'aide intégrée (français, hors-ligne). Texte statique de l'application (aucune donnée utilisateur) : chaque rubrique = { id, title,
// html }. Les exemples sont fictifs (« Client Exemple », plan de charpente). Les liens internes sont de la forme <a href="#aide-<id>">.
// « Ctrl+Maj++ » → Ctrl, Maj, + (la touche « + » elle-même est la dernière quand la chaîne finit par « ++ »).
const keysOf = (s) => (s.endsWith('++') ? [...s.slice(0, -2).split('+'), '+'] : s === '+' ? ['+'] : s.split('+'));
const K = (s) => keysOf(s).map((k) => `<kbd>${k}</kbd>`).join('+');
const steps = (...l) => `<ol>${l.map((x) => `<li>${x}</li>`).join('')}</ol>`;
const traps = (...l) => `<div class="help-traps"><strong>Pièges</strong><ul>${l.map((x) => `<li>${x}</li>`).join('')}</ul></div>`;

export const SECTIONS = [
  { id: 'demarrer', title: 'Ouvrir, enregistrer, onglets', html: `
<p>Orical PDF ouvre plusieurs PDF dans des onglets. Tout ce que vous ajoutez (texte, formes, mesures, tampons…) reste modifiable tant que le
document est ouvert. À l'enregistrement, vous choisissez : <strong>Modifiable</strong> (Orical PDF pourra le rééditer à la réouverture) ou
<strong>Aplati</strong> (figé dans la page). Dans les deux cas, les autres lecteurs le voient comme le contenu de la page.</p>
${steps('Ouvrir : ' + K('Ctrl+O') + ', bouton « Ouvrir » de l\'onglet Accueil, glisser un PDF sur la fenêtre, ou la liste « Récents ».',
    'Travailler : chaque modification est annulable (' + K('Ctrl+Z') + ' / ' + K('Ctrl+Y') + ').',
    'Enregistrer : ' + K('Ctrl+S') + ' remplace le fichier ; « Enregistrer sous » crée une copie (conseillé pour un plan envoyé à « Client Exemple »).',
    'Fermer l\'onglet : ' + K('Ctrl+W') + ' (une question est posée s\'il reste des modifications).')}
${traps('Un fichier enregistré en Aplati ne se réédite plus : ses objets sont du contenu de page. Choisissez Modifiable pour un document de travail (voir « Enregistrer : modifiable ou aplati ? »).',
    'Un PDF protégé par mot de passe s\'ouvre avec son mot de passe et se réenregistre protégé.')}` },

  { id: 'texte', title: 'Texte : ajouter et modifier', html: `
<p><strong>Ajouter du texte</strong> (onglet Annoter, outil Texte) ou <strong>modifier un texte existant</strong> (outil « Modifier texte »).</p>
${steps('Choisir l\'outil Texte, cliquer à l\'endroit voulu, taper ; ' + K('Entrée') + ' pour valider, ' + K('Maj+Entrée') + ' pour une nouvelle ligne.',
    'Police, taille, couleur, gras, alignement, largeur fixe : panneau Propriétés (bouton du ruban ou de la barre d\'état).',
    'Modifier un texte du PDF : outil « Modifier texte », cliquer sur le mot : l\'ancien texte est recouvert d\'un fond et le nouveau écrit par-dessus.')}
${traps('« Modifier texte » n\'efface pas l\'ancien texte du fichier : il reste lisible par une extraction. Pour supprimer une information, utilisez le <a href="#aide-caviardage">caviardage</a>.',
    'Pas d\'édition de texte sur une page pivotée (un message s\'affiche) ; les polices d\'origine incorporées ne sont pas réutilisables (Helvetica, Times ou Courier à la place).')}` },

  { id: 'annotations', title: 'Annotations : formes, flèches, légendes, notes, tampons, images, signatures', html: `
<p>Onglet <strong>Annoter</strong>. Les outils restent actifs jusqu'à ce que vous en choisissiez un autre (ou ${K('Échap')}).</p>
${steps('Formes : ligne, flèche, rectangle, ellipse, polygone, polyligne, nuage de révision, surlignage, crayon. ' + K('Maj') + ' : proportions libres / angle par pas de 15°.',
    'Légende fléchée : cliquer sur le point à désigner (aimanté sur les traits du plan, ' + K('Alt') + ' pour désactiver), glisser jusqu\'à la place du texte, taper. Exemple : « Poteau P12 – lamellé-collé GL24h ».',
    'Note : un post-it avec ombre légère. Tampons : bibliothèque (Approuvé, À revoir…), date et nom en option.',
    'Images et signatures : insérer un fichier, coller une image (' + K('Ctrl+V') + ') ou dessiner une signature (image figée, sans valeur juridique).',
    'Sélection : clic, ' + K('Maj') + '+clic pour plusieurs ; déplacer, redimensionner, tourner ; ' + K('Ctrl+D') + ' dupliquer, ' + K('Suppr') + ' supprimer, flèches = déplacement fin.')}
${traps('Une signature dessinée n\'est pas une signature électronique (aucun certificat).', 'Pas d\'aimantation sur un plan scanné (image).')}` },

  { id: 'mesure', title: 'Mesure : échelle, calibrage, aimantation', html: `
<p>Onglet <strong>Mesure</strong> : distances, polylignes, surfaces, angles, cotes, cercles, sur des plans vectoriels ou scannés.</p>
<svg class="help-svg" viewBox="0 0 320 70" role="img" aria-label="Calibrage : deux clics sur une longueur connue"><rect x="10" y="20" width="300" height="30" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="60" x2="310" y2="60" stroke="#E0272F" stroke-width="2"/><circle cx="10" cy="60" r="4" fill="#E0272F"/><circle cx="310" cy="60" r="4" fill="#E0272F"/><text x="160" y="14" text-anchor="middle" font-size="11" fill="currentColor">poutre : 6,00 m connue → 2 clics, saisir 6,00 m</text></svg>
${steps('Échelle : choisir une échelle connue (1:50, 1:100…) ou « Calibrer » : deux clics sur une longueur connue du plan puis sa valeur réelle.',
    'Mesurer : choisir l\'outil, cliquer les points (double-clic ou ' + K('Entrée') + ' pour finir une polyligne ou une surface).',
    'Aimantation : les extrémités et intersections des traits du plan attirent le pointeur ; ' + K('Alt') + ' pour la désactiver ponctuellement.',
    'Panneau Mesures : liste, totaux par type, export CSV ; option « inclure dans le PDF ».')}
${traps('L\'échelle n\'est pas lue dans le PDF : vérifiez-la sur une cote connue. Elle est mémorisée par fichier sur ce PC seulement.', 'Une page recadrée ou pivotée garde son échelle.')}` },
  { id: 'distance-cote', title: 'Distance ou Cote ?', html: `
<p>Les deux donnent la même longueur (même échelle, même aimantation) ; seul le dessin change.</p>
<ul><li><strong>Distance</strong> (onglet Mesure) : mesure rapide directement sur le trait, valeur au milieu du trait ; option « Afficher dX / dY » (décomposition horizontale et verticale).</li>
<li><strong>Cote</strong> : cote de plan décalée, avec flèches et traits d'attache, valeur au-dessus de la ligne de cote ; « Décalage de la cote » réglable dans le panneau Propriétés.</li></ul>
<p>Le texte reste toujours lisible, jamais à l'envers, quel que soit le sens du tracé, y compris sur une page pivotée (rotation du PDF ou « Pivoter » de l'onglet Pages / Accueil) ; la valeur d'une cote est toujours au-dessus de sa ligne. La rotation de l'affichage seul (onglet Affichage) n'est pas écrite dans le fichier : les textes sont orientés pour la page, pas pour la vue.</p>` },

  { id: 'pages', title: 'Pages : rotation, ordre, recadrage, extraction, division, numérotation', html: `
<p>Onglet <strong>Pages</strong> et panneau des miniatures (${K('F4')}). Sélection multiple : ${K('Ctrl')}+clic, ${K('Maj')}+clic.</p>
${steps('Pivoter : ' + K('Ctrl+Maj++') + ' / ' + K('Ctrl+Maj+-') + ' (page courante ou sélection).',
    'Déplacer : glisser les miniatures. Dupliquer, supprimer, insérer une page blanche ou un autre PDF (aussi par glisser-déposer dans les miniatures).',
    'Recadrer : tracer le cadre puis valider (le contenu hors cadre n\'est pas supprimé, il est masqué).',
    'Extraire ou diviser : vers de nouveaux fichiers (jamais d\'écrasement).',
    'Numéroter : position, format (« Page 1 / 12 », « A-01 »…), pages concernées ; aperçu avant écriture.')}
${traps('Une opération de pages reconstruit le fichier à l\'enregistrement : les signets suivent les pages, mais les liens internes et les champs de formulaire du PDF d\'origine ne sont pas conservés (les champs créés dans Orical PDF, eux, le sont).')}` },

  { id: 'fusion', title: 'Fusion de PDF', html: `
<p>Assembler plusieurs PDF en un seul (onglet Pages ou Accueil, « Fusionner »).</p>
${steps('Ajouter des fichiers (bouton, glisser-déposer ou onglets ouverts).', 'Ordonner, choisir des plages (« 1-3, 5 ») et une rotation par fichier.',
    'Option : un signet par fichier source.', '« Fusionner » : le résultat s\'ouvre dans un nouvel onglet non enregistré.')}
${traps('Liens internes et formulaires des sources ne sont pas repris.')}` },

  { id: 'impression', title: 'Impression : taille réelle, plans, marges, couleur', html: `
<p>${K('Ctrl+P')}. Chaque page est imprimée sur une feuille de la taille choisie, sans mise à l'échelle cachée : un plan A1 au 1:50 reste au 1:50
s'il est imprimé en A1 « taille réelle ».</p>
${steps('Choisir l\'imprimante et le papier (« format de la page » ou un format fixe).', 'Taille réelle ou ajustée à la feuille ; marges ; orientation automatique.',
    'Couleur, niveaux de gris ou noir et blanc ; traits fins renforcés pour les plans.', 'Pages : toutes, courante, sélection ou plage. La file d\'attente s\'affiche en bas ; on peut annuler.')}
${traps('Une imprimante a des marges matérielles : sur un traceur, choisissez un format de papier qui les inclut.', 'Les annotations sont imprimées comme à l\'enregistrement.')}
<p><b>Feuille tournée ou coupée par l'imprimante</b> : l'option avancée « Orientation envoyée à l'imprimante » (Automatique par défaut, Portrait ou
Paysage) change seulement l'orientation annoncée au pilote, ni l'aperçu ni la mise en page ; elle est mémorisée pour chaque imprimante.</p>
<p><b>Feuille sortie dans un autre format</b> (A4 au lieu d'A3, dessin coupé) : la ligne « Envoi » sous l'aperçu indique ce qui part vers
l'imprimante. L'option avancée « Méthode d'envoi du format » est mémorisée pour chaque imprimante : « Automatique » (défaut) annonce le format
par son code de papier Windows (A3, A4…), ce que les copieurs respectent ; « Taille personnalisée » n'envoie que les
dimensions (ancien comportement, à essayer si l'automatique échoue) ; « Papier par défaut du pilote » laisse le papier réglé dans le pilote. Pour un format sans code (A1, A0 sur certains
traceurs), choisissez le papier dans « Boîte Windows… ».</p>
<p>Si le problème persiste, « Copier le journal d'impression » (À propos) donne, pour chaque tâche, le format, l'orientation et les options envoyées,
sans nom de fichier ni chemin : à joindre à votre signalement.</p>` },

  { id: 'comparer', title: 'Comparer deux documents (indices de plan)', html: `
<p>Onglet Document, « Comparer » : superposition en deux couleurs, côte à côte ou fondu, liste des zones modifiées, comparaison du texte.</p>
${steps('Choisir les deux documents (ex. « Charpente indice A » et « indice B ») et les paires de pages.', 'Le décalage est corrigé automatiquement (ajustable).',
    'Parcourir les zones, régler la tolérance, exporter un rapport PDF.')}
${traps('Comparaison d\'images : pas de rotation ni de changement d\'échelle entre indices.')}` },

  { id: 'ocr', title: 'Reconnaissance de texte (OCR)', html: `
<p>Rendre cherchable et copiable le texte d'un plan scanné (onglet Document, « Reconnaître le texte »), en français et en anglais, sans réseau.</p>
${steps('Choisir les pages, la langue, la qualité et le type de page (texte ou plan).', 'Le texte reconnu est ajouté en couche invisible ; « mots peu sûrs » les surligne.', 'Enregistrer : la couche est écrite dans le PDF.')}
${traps('Qualité dépendante du scan (≥ 200 dpi, net). Écriture manuscrite et petits textes mal lus.')}
<p><b>Page posée de côté ou à l'envers</b> (type « texte », option « Détecter l'orientation de la page ») : si la lecture à l'endroit est douteuse, Orical PDF
essaie les quatre sens sur une partie de la page et garde celui qui donne le texte le plus sûr. Cela ajoute quelques secondes, seulement aux
pages douteuses ; une page droite et nette n'est pas ralentie.</p>
<p><b>Limites</b> : écriture manuscrite ; plans à faible contraste ou très clairsemés (peu de texte pour décider du sens : choisir le type
« plan ») ; fond gris très bruité ou taché (le bruit peut être pris pour de l'encre : aucun texte reconnu) ; pages mélangeant plusieurs sens
d'écriture (le type « plan » lit aussi le texte pivoté de 90°). En cas de doute, pivotez d'abord la page (onglet Pages) puis relancez la reconnaissance.</p>` },

  { id: 'formulaires', title: 'Formulaires : remplir et créer des champs', html: `
<p>Onglet <strong>Formulaire</strong>. Un PDF qui contient déjà des champs se remplit directement sur la page (${K('Tab')} pour passer au suivant).</p>
${steps('Créer : choisir un type (texte, case à cocher, boutons radio, liste déroulante, liste, date), cliquer (taille par défaut) ou tracer le cadre.',
    'Régler dans Propriétés : nom (unique), infobulle, valeur par défaut, options (une par ligne), obligatoire, lecture seule, aspect.',
    'Ordre de tabulation : bouton du même nom ; Aligner : sélectionner plusieurs objets puis choisir un alignement.',
    '« Prévisualiser / remplir » : tester comme un lecteur ; cliquer à nouveau pour revenir à la conception.',
    'Remplir : surbrillance des champs, « Aplatir à l\'enregistrement » pour figer les valeurs.')}
${traps('Pas de JavaScript : ni calcul, ni contrôle de format (la date est un texte jj/mm/aaaa).', 'Après réouverture, les champs créés se remplissent mais ne se déplacent plus.')}` },

  { id: 'caviardage', title: 'Caviardage : supprimer définitivement une information', html: `
<div class="help-warn"><strong>À lire avant de diffuser.</strong> Orical PDF ne garantit pas qu'aucune information ne subsiste : vérifiez toujours le fichier
produit dans un autre lecteur PDF (recherche du mot, copier-coller, propriétés du document).</div>
<p><strong>Méthode</strong> : chaque page qui contient une zone est remplacée par une <strong>image</strong> où les zones sont peintes. Le texte, les traits,
les images, les annotations et les champs de cette page n'existent plus dans le fichier enregistré.</p>
${steps('Onglet Document, groupe Caviarder : tracer des zones ou « Rechercher et caviarder » (mot, e-mail, téléphone, IBAN).',
    'Vérifier chaque zone hachurée (la position d\'un mot trouvé est estimée, une marge est ajoutée).',
    '« Appliquer le caviardage » : lire la liste « Éléments à vérifier », cocher « J\'ai compris ».',
    '« Nettoyer les métadonnées » si besoin, puis enregistrer : un nouveau fichier « … (caviardé).pdf » est créé, l\'original n\'est jamais remplacé.',
    'Contrôler le résultat dans un autre lecteur.')}
<p><strong>Supprimé automatiquement</strong> : contenu des pages caviardées, signets, pièces jointes, JavaScript et actions, destinations nommées, noms et valeurs
des champs, annotations masquées. <strong>Peut subsister</strong> : tout ce qui est sur une page <em>sans zone</em> (texte, commentaires, adresses web des liens),
les métadonnées non cochées, le contenu d'une page insérée depuis un autre PDF qui n'a pas été analysé.</p>
${traps('Avec des zones non appliquées, l\'impression, l\'export en images, la fusion, l\'extraction et la division demandent d\'abord d\'appliquer : sinon le texte sous les zones sort en clair.',
    '« Modifier texte » ou un rectangle noir ne caviardent pas.')}` },

  { id: 'document', title: 'Document : protection, propriétés, optimisation, export en images', html: `
${steps('Propriétés : titre, auteur, sujet, mots-clés (écrits à l\'enregistrement).',
    'Protéger : enregistrer le PDF chiffré par mot de passe, avec autorisations (impression, copie, modification).',
    'Optimiser : réenregistrer avec des flux compressés (taille avant / après affichée ; les images ne sont pas recompressées).',
    'Pages en images : PNG ou JPEG, 36 à 1200 dpi, dans un dossier choisi.')}
${traps('Un mot de passe oublié ne peut pas être retrouvé.')}` },

  { id: 'modifiable', title: 'Enregistrer : modifiable ou aplati ?', html: `
<p>À l'enregistrement d'un document annoté, Orical PDF demande comment enregistrer les annotations (texte, formes, tampons, signatures, images, mesures,
légendes, numérotation, champs créés) :</p>
<ul><li><strong>Modifiables</strong> : le PDF reste lisible partout, annotations visibles et imprimées ; rouvert dans Orical PDF, chaque objet se
déplace et se modifie à nouveau. L'indicateur « Annotations modifiables » apparaît dans la barre d'état.</li>
<li><strong>Aplaties</strong> : les annotations font partie des pages et ne se modifient plus (document définitif, signé, à diffuser).</li></ul>
${steps('Choix à chaque enregistrement, ou « Mémoriser mon choix » (pour le changer : Réglages > Annotations, « À l\'enregistrement »).',
    'Un document rouvert en modifiable s\'enregistre de nouveau en modifiable ; clic sur l\'indicateur de la barre d\'état : enregistrer en choisissant Modifiable ou Aplati.',
    'Un gros fichier se restaure en arrière-plan (bandeau) ; « Ouvrir sans les annotations modifiables » l\'ouvre avec ses annotations figées.')}
${traps('Modifiable : toute personne qui ouvre le fichier avec Orical PDF peut déplacer ou retirer les annotations, y compris les tampons et signatures. Pour un document signé ou définitif : Aplati.',
    'Caviardage appliqué ou « Nettoyer les métadonnées » : enregistrement toujours en Aplati (aucune information cachée ne doit subsister).',
    'Dans les autres lecteurs (Acrobat, Edge…), les annotations sont visibles mais font partie de la page : elles ne s\'y modifient pas. Si un autre outil réécrit le fichier (contenu des pages, nombre de pages), Orical PDF l\'ouvre avec les annotations figées et l\'indique.',
    'À la réouverture, l\'historique d\'annulation repart de zéro ; les opérations de pages faites avant l\'enregistrement sont intégrées au fichier.',
    'Fusion : un fichier modifiable ajouté à une fusion garde ses annotations visibles, mais figées dans le fichier fusionné.')}` },

  { id: 'favoris', title: 'Mes favoris (onglet Accueil)', html: `
<p>Clic droit sur une commande du ruban (n'importe quel onglet), ou touche Menu / ${K('Maj+F10')} au clavier, puis « Ajouter aux favoris » : elle apparaît dans l'onglet <strong>Accueil</strong>, groupe « Favoris » (12 au plus), et reste aussi dans son onglet.</p>
<p>Clic droit sur un favori : « Retirer des favoris », « Déplacer à gauche / à droite ». Les favoris sont mémorisés sur ce PC ; le groupe n'apparaît que s'il y a au moins un favori.</p>
<p>Un favori fait exactement la même chose que la commande d'origine et montre le même état (outil actif, option activée, commande indisponible). Les listes déroulantes (unité, décimales) ne peuvent pas être ajoutées.</p>` },

  { id: 'ruban', title: 'Où sont les commandes ? (ruban réorganisé en 0.12)', html: `
<p>Le ruban passe de 8 à 7 onglets ; aucune commande n'a été retirée, aucun raccourci n'a changé.</p>
<table class="help-table"><thead><tr><th>Commande</th><th>Avant</th><th>Maintenant</th></tr></thead><tbody>
<tr><td>Zone à caviarder, Rechercher et caviarder, Retirer les zones, Appliquer le caviardage, OCR pages caviardées</td><td>Caviarder</td><td>Document, groupe Caviarder</td></tr>
<tr><td>Nettoyer les métadonnées</td><td>Caviarder</td><td>Document, groupe Document</td></tr>
<tr><td>Surbrillance des champs, Aplatir à l'enregistrement, Exemplaire aplati</td><td>Document</td><td>Formulaire, groupe Remplir</td></tr>
</tbody></table>` },

  { id: 'raccourcis', title: 'Raccourcis clavier', html: `
<table class="help-table"><thead><tr><th>Touches</th><th>Action</th></tr></thead><tbody>
${[['F1', 'Aide'], ['Ctrl+O', 'Ouvrir'], ['Ctrl+S', 'Enregistrer'], ['Ctrl+P', 'Imprimer'], ['Ctrl+W', 'Fermer l\'onglet'], ['Ctrl+Tab', 'Onglet suivant (Maj : précédent)'],
    ['Ctrl+F', 'Rechercher dans le document'], ['Ctrl+Z', 'Annuler'], ['Ctrl+Y', 'Rétablir (aussi Ctrl+Maj+Z)'], ['Ctrl++', 'Zoom avant'], ['Ctrl+-', 'Zoom arrière'],
    ['Ctrl+Maj++', 'Pivoter la page à droite'], ['Ctrl+Maj+-', 'Pivoter la page à gauche'], ['Ctrl+C', 'Copier (objets ou texte sélectionné)'], ['Ctrl+X', 'Couper les objets'],
    ['Ctrl+V', 'Coller (objets ou image du presse-papiers)'], ['Ctrl+D', 'Dupliquer les objets'], ['Suppr', 'Supprimer les objets sélectionnés'], ['Flèches', 'Déplacer finement les objets sélectionnés'],
    ['Entrée', 'Valider un texte ; finir une polyligne ou une surface'], ['Échap', 'Annuler l\'action en cours, fermer une boîte'], ['Maj', 'Pendant un tracé : proportions libres / angle par pas de 15°'],
    ['Alt', 'Désactiver l\'aimantation (mesure, légende)'], ['Espace', 'Maintenue : déplacer la vue (aussi clic molette)'], ['Tab', 'Champ de formulaire suivant (Maj+Tab : précédent)'],
    ['F4', 'Panneau latéral'], ['F11', 'Plein écran']].map(([k, a]) => `<tr><td>${K(k)}</td><td>${a}</td></tr>`).join('')}
</tbody></table>` },

  { id: 'limites', title: 'Limites connues', html: `<ul>
<li><b>Annotations</b> : modifiables à la réouverture seulement si le fichier a été enregistré en « Modifiable » avec Orical PDF (1.2.0 ou plus) et n'a pas été réécrit par un autre outil ; l'historique d'annulation repart de zéro ; dans les autres lecteurs, elles sont visibles mais non modifiables.</li>
<li><b>Champs de formulaire créés</b> : figés après réouverture (ils se remplissent, mais leur position et leurs propriétés ne se modifient plus) ; pas de JavaScript (calculs, formats, boutons d'action) ; liste à choix unique.</li>
<li><b>Texte</b> : non éditable sur une page pivotée ; polices d'origine incorporées non réutilisables (Helvetica, Times, Courier) ; caractères hors jeu Windows latin remplacés par « ? » dans le texte ajouté.</li>
<li><b>Mesure</b> : l'échelle n'est pas lue dans le PDF (à saisir ou à calibrer) ; pas d'aimantation sur un plan scanné.</li>
<li><b>OCR</b> : écriture manuscrite mal lue ; fond gris très bruité ou taché : aucun texte reconnu ; tout caractère non latin est remplacé par « ? » dans la couche de texte invisible.</li>
<li><b>Caviardage</b> : pages caviardées transformées en images (plus lourdes, texte à reconnaître par OCR) ; aucune garantie absolue : vérifiez toujours le fichier produit dans un autre lecteur PDF avant de le diffuser.</li>
<li><b>Pages</b> : après une opération de pages, les liens internes et les champs du PDF d'origine ne sont pas conservés (les signets suivent les pages ; les champs créés dans Orical PDF sont conservés).</li>
<li><b>Impression</b> sur imprimante physique et traceur non vérifiée au papier par les tests automatiques.</li></ul>` },

  { id: 'smartscreen', title: "Avertissement de Windows à l'installation", html: `
<p>Orical PDF n'est pas signé numériquement (un certificat de signature de code est payant, et il n'y a pas de budget pour cela pour l'instant). Windows SmartScreen peut donc afficher « Windows a protégé votre ordinateur » au lancement de l'installeur ou de la version portable. C'est le comportement habituel pour un logiciel non signé et peu téléchargé ; cela ne signale pas un problème détecté dans le fichier.</p>
${steps('Cliquer sur « Informations complémentaires ».', 'Cliquer sur « Exécuter quand même ».')}
<p><b>Vérifier le fichier téléchargé</b> : comparer son empreinte SHA-256 avec celle du fichier <code>SHA256SUMS.txt</code> joint à la Release. Dans PowerShell, dans le dossier du téléchargement : <code>Get-FileHash .\\OricalPDF-Setup-x.y.z.exe -Algorithm SHA256</code>. Les deux valeurs doivent être identiques (la casse des lettres ne compte pas) ; sinon, ne pas lancer le fichier et le télécharger de nouveau.</p>` },

  { id: 'confidentialite', title: 'Hors-ligne, confidentialité, diagnostic', html: `
<p>Orical PDF fonctionne <strong>100 % hors-ligne</strong> : aucune connexion réseau, aucune télémétrie, aucune mise à jour automatique. Toute tentative de
requête réseau est bloquée et comptée (Réglages > À propos).</p>
${steps('Signaler un problème : Réglages > À propos > « Copier les informations de diagnostic ».',
    'Coller le texte dans votre message : version, Windows, mémoire, écrans, noms des imprimantes. Aucun nom de fichier, chemin ni contenu de document n\'y figure.')}` },

  { id: 'windows', title: 'Lecteur PDF de Windows', html: `<p>Réglages > <b>Intégration à Windows</b>.</p><ul>
<li><b>Lecteur PDF</b> : l'installation ajoute Orical PDF à « Ouvrir avec » (clic droit sur un PDF), sans remplacer votre lecteur actuel. Pour en faire le lecteur par défaut : bouton « Applications par défaut de Windows… ».</li>
<li><b>Icône des fichiers PDF</b> : l'installation ne change jamais le lecteur par défaut ; l'icône Orical des fichiers PDF n'apparaît donc que si vous avez choisi Orical PDF comme application par défaut pour les PDF.</li></ul>` },
  { id: 'informatique', title: 'Notes pour le service informatique', html: `<ul>
<li>Installeur par utilisateur (NSIS), sans droits administrateur. Dossier par défaut : <code>%LOCALAPPDATA%\\Programs\\Orical PDF</code> (modifiable).</li>
<li>Données de l'utilisateur (réglages, récents, bibliothèque de tampons et signatures, échelles) : <code>%APPDATA%\\Spin A Doc</code> (nom historique, gardé pour retrouver les données des versions précédentes).</li>
<li>Aucun service Windows, aucune tâche planifiée, aucune connexion réseau, aucune télémétrie.</li>
<li>Installation silencieuse : <code>OricalPDF-Setup-x.y.z.exe /S</code> ; dossier imposé : <code>/D=C:\\Programmes\\OricalPDF</code> (toujours en dernier, sans guillemets).</li>
<li>Désinstallation : Paramètres > Applications, ou <code>"Uninstall Orical PDF.exe" /S</code> dans le dossier d'installation ; les données de l'utilisateur sont conservées,
sauf si la case « Supprimer aussi mes réglages et ma bibliothèque » est cochée (en silencieux : <code>/DELETEDATA=1</code>).</li>
<li>Association .pdf : inscription dans « Ouvrir avec » seulement (<code>HKCU\Software\Classes\.pdf\OpenWithProgids</code> = <code>SpinADoc.pdf</code>, RegisteredApplications) ; la valeur par défaut de <code>.pdf</code> n'est jamais modifiée. Tout est retiré à la désinstallation.</li>
<li>Version portable : aucun installateur, mêmes données dans <code>%APPDATA%\\Spin A Doc</code>.</li>
<li>Fichiers non signés : SmartScreen peut avertir (voir <a href="#aide-smartscreen">Avertissement de Windows à l'installation</a>). AppLocker / listes blanches : autoriser par chemin ou par empreinte SHA-256 (<code>Get-FileHash</code>).</li>
<li>Licences : application « Tous droits réservés » ; composants tiers sous licences permissives (MIT, Apache-2.0, BSD, ISC, OFL), liste dans À propos.</li></ul>` },
];
