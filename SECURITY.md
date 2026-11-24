# Sécurité

## Signaler une vulnérabilité

Merci de **ne pas** ouvrir de ticket public pour une faille de sécurité. Utilisez la fonction de signalement privé de GitHub :
onglet **« Security »** du dépôt, puis **« Report a vulnerability »**. Le signalement n'est visible que des responsables du dépôt.

Décrivez si possible :

- la version d'Orical PDF (Réglages > À propos) et la version de Windows ;
- les étapes pour reproduire le problème et l'effet observé ;
- les informations de diagnostic (Réglages > À propos > « Copier les informations de diagnostic » : elles ne contiennent aucun nom de
  fichier, chemin ni contenu de document).

**Ne joignez aucun document confidentiel.** Si un PDF est nécessaire pour reproduire le problème, fabriquez un fichier d'exemple sans
donnée réelle.

## Rappel : application hors-ligne

Orical PDF fonctionne hors ligne : aucune télémétrie, aucun document envoyé. Toute tentative de requête réseau des fenêtres de
l'application est bloquée et comptée (Réglages > À propos). Seule connexion, désactivable : la recherche de mise à jour (une requête HTTPS
vers orical.app, une fois par jour au plus, réponse validée strictement ; rien n'est installé automatiquement). Les documents ouverts ne quittent jamais le poste.

## Versions prises en charge

Seule la dernière version publiée dans les Releases du dépôt reçoit des correctifs. Il n'y a pas de mise à jour automatique : pour
installer un correctif, lancer le nouvel installeur par-dessus l'ancien (réglages conservés).
