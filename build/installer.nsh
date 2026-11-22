; Orical PDF — compléments à l'installeur NSIS d'electron-builder (inclus automatiquement : build/installer.nsh).
;
; Désinstallation : page « Données de l'utilisateur » avec la case « Supprimer aussi mes réglages et ma bibliothèque », DÉCOCHÉE par défaut.
; Données de l'utilisateur : $APPDATA\Spin A Doc (réglages, récents, bibliothèque de tampons et de signatures, échelles de mesure).
;  - Mise à jour (nouvel installeur par-dessus l'ancien : désinstallation « --updated ») : rien n'est jamais supprimé.
;  - Désinstallation silencieuse (/S) : données conservées, sauf avec /DELETEDATA=1.
;  - Tests automatiques : /DATADIR=<dossier> remplace le dossier de données, accepté SEULEMENT s'il contient le fichier témoin
;    « .spinadoc-test » (le profil réel n'est jamais touché par les tests).
;
; Association .pdf (0.12.1) : inscription dans « Ouvrir avec » SEULEMENT (OpenWithProgids, Applications, RegisteredApplications pour la page
; « Applications par défaut » de Windows). La valeur par défaut de Software\Classes\.pdf n'est JAMAIS écrite : le lecteur choisi par
; l'utilisateur reste le sien. Clés écrites dans SHCTX (HKCU pour une installation par utilisateur), toutes retirées à la désinstallation.
; L'icône des fichiers PDF (DefaultIcon de la classe = resources\pdf-file.ico, extraResources) n'apparaît donc que pour les PDF dont
; l'application par défaut, choisie par l'utilisateur, est Orical PDF. La version portable n'écrit aucune clé.
;
; Renommage 1.3.0 (Spin A Doc → Orical PDF) : appId, ProgId SpinADoc.pdf et Software\SpinADoc gardés (même désinstallation, choix
; « application par défaut » conservé) ; l'exécutable change de nom : la clé Applications\Spin A Doc.exe et la valeur « Spin A Doc » de
; RegisteredApplications de la 1.2.1 sont retirées à l'installation (la désinstallation « --updated » de la 1.2.1 les retire déjà).

!include LogicLib.nsh
!include nsDialogs.nsh
!include FileFunc.nsh

!define SPIN_PROGID "SpinADoc.pdf"
!define SPIN_CAPS "Software\SpinADoc\Capabilities"
!define SPIN_LEGACY_NAME "Spin A Doc"
!define SPIN_LEGACY_EXE "Spin A Doc.exe"

!ifndef BUILD_UNINSTALLER
; Dossier d'installation (1.3.0) : electron-builder reprend le dossier de l'installation précédente (InstallLocation), « …\Spin A Doc » pour
; la 1.2.1, et y ajouterait « \Orical PDF » (instFilesPre). Si le dossier choisi s'appelle exactement « Spin A Doc », on installe dans le
; dossier VOISIN « Orical PDF » ; la désinstallation « --updated » de la 1.2.1 (lancée sur l'ancien dossier, lu dans le registre) le vide et
; le supprime. Appelé à l'initialisation (installation silencieuse : aucune page) et après la page du dossier (assistant).
Var SpinOldDir
Function spinFixInstDir
  ${GetFileName} "$INSTDIR" $R8
  ${If} $R8 == "${SPIN_LEGACY_NAME}"
    ${GetParent} "$INSTDIR" $R9
    StrCpy $SpinOldDir "$INSTDIR"
    StrCpy $INSTDIR "$R9\${APP_FILENAME}"
  ${EndIf}
FunctionEnd
Function spinFixDirPage
  Call spinFixInstDir
  Abort ; page invisible
FunctionEnd
!macro customInit
  Call spinFixInstDir
!macroend
!macro customPageAfterChangeDir
  Page custom spinFixDirPage
!macroend

!macro customInstall
  ; Ancien dossier « Spin A Doc » : retiré s'il est resté vide (jamais de suppression récursive ici).
  ${If} $SpinOldDir != ""
  ${AndIf} $SpinOldDir != $INSTDIR
    RMDir "$SpinOldDir"
  ${EndIf}
  StrCpy $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ; Traces de l'ancien nom (1.2.1 et avant) : jamais deux entrées « Ouvrir avec » ni deux noms dans « Applications par défaut ».
  ${If} "${APP_EXECUTABLE_FILENAME}" != "${SPIN_LEGACY_EXE}"
    DeleteRegKey SHCTX "Software\Classes\Applications\${SPIN_LEGACY_EXE}"
    DeleteRegValue SHCTX "Software\RegisteredApplications" "${SPIN_LEGACY_NAME}"
  ${EndIf}
  WriteRegStr SHCTX "Software\Classes\${SPIN_PROGID}" "" "Document PDF (Orical PDF)"
  WriteRegStr SHCTX "Software\Classes\${SPIN_PROGID}\DefaultIcon" "" "$INSTDIR\resources\pdf-file.ico,0"
  WriteRegStr SHCTX "Software\Classes\${SPIN_PROGID}\shell\open\command" "" '"$0" "%1"'
  WriteRegStr SHCTX "Software\Classes\.pdf\OpenWithProgids" "${SPIN_PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "Orical PDF"
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".pdf" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$0" "%1"'
  WriteRegStr SHCTX "${SPIN_CAPS}" "ApplicationName" "Orical PDF"
  WriteRegStr SHCTX "${SPIN_CAPS}" "ApplicationDescription" "Lecteur et éditeur de documents PDF"
  WriteRegStr SHCTX "${SPIN_CAPS}\FileAssociations" ".pdf" "${SPIN_PROGID}"
  WriteRegStr SHCTX "Software\RegisteredApplications" "Orical PDF" "${SPIN_CAPS}"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
!macroend
!endif

!ifdef BUILD_UNINSTALLER

Var SpinDelData
Var SpinDelBox

; Les fonctions sont définies DANS la macro : elle est développée avec les pages, après l'inclusion de MUI (MUI_HEADER_TEXT).
!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.spinDataPage un.spinDataPageLeave

Function un.spinDataPage
  !insertmacro MUI_HEADER_TEXT "Données de l'utilisateur" "Réglages, documents récents, bibliothèque de tampons et de signatures"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 40u "Vos réglages et votre bibliothèque sont conservés : ils seront retrouvés si vous réinstallez Orical PDF. Cochez la case pour les supprimer aussi (dossier « $APPDATA\Spin A Doc »)."
  Pop $0
  ${NSD_CreateCheckbox} 0 48u 100% 14u "Supprimer aussi mes réglages et ma bibliothèque"
  Pop $SpinDelBox
  ${If} $SpinDelData == "1"
    ${NSD_Check} $SpinDelBox
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function un.spinDataPageLeave
  ${NSD_GetState} $SpinDelBox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SpinDelData "1"
  ${Else}
    StrCpy $SpinDelData "0"
  ${EndIf}
FunctionEnd
!macroend

!macro customUnInstall
  ; Association « Ouvrir avec » : retirée dans tous les cas (une mise à jour la réécrit juste après). La valeur par défaut de .pdf n'est pas touchée.
  DeleteRegValue SHCTX "Software\Classes\.pdf\OpenWithProgids" "${SPIN_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\${SPIN_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Orical PDF"
  DeleteRegKey SHCTX "Software\Classes\Applications\${SPIN_LEGACY_EXE}"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "${SPIN_LEGACY_NAME}"
  DeleteRegKey SHCTX "Software\SpinADoc"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
  ${IfNot} ${isUpdated}
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/DELETEDATA=" $R1
    ${IfNot} ${Errors}
      StrCpy $SpinDelData $R1
    ${EndIf}
    ${If} $SpinDelData == "1"
      StrCpy $R2 "$APPDATA\Spin A Doc"
      ClearErrors
      ${GetOptions} $R0 "/DATADIR=" $R3
      ${IfNot} ${Errors}
        ${If} ${FileExists} "$R3\.spinadoc-test"
          StrCpy $R2 $R3
        ${Else}
          StrCpy $R2 ""
        ${EndIf}
      ${EndIf}
      ${If} $R2 != ""
        RMDir /r "$R2"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!endif
