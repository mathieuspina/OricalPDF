; Orical PDF — compléments à l'installeur NSIS d'electron-builder (inclus automatiquement : build/installer.nsh).
;
; Désinstallation : page « Données de l'utilisateur » avec la case « Supprimer aussi mes réglages et ma bibliothèque », DÉCOCHÉE par défaut.
; Données de l'utilisateur : $APPDATA\Orical PDF (réglages, récents, bibliothèque de tampons et de signatures, échelles de mesure).
;  - Mise à jour (nouvel installeur par-dessus l'ancien : désinstallation « --updated ») : rien n'est jamais supprimé.
;  - Désinstallation silencieuse (/S) : données conservées, sauf avec /DELETEDATA=1.
;  - Tests automatiques : /DATADIR=<dossier> remplace le dossier de données, accepté SEULEMENT s'il contient le fichier témoin
;    « .oricalpdf-test » (le profil réel n'est jamais touché par les tests).
;
; Association .pdf : inscription dans « Ouvrir avec » SEULEMENT (OpenWithProgids, Applications, RegisteredApplications pour la page
; « Applications par défaut » de Windows). La valeur par défaut de Software\Classes\.pdf n'est JAMAIS écrite : le lecteur choisi par
; l'utilisateur reste le sien. Clés écrites dans SHCTX (HKCU pour une installation par utilisateur), toutes retirées à la désinstallation.
; ProgId « OricalPDF.pdf » ; capacités dans Software\Orical\OricalPDF\Capabilities (même racine que la future clé de stratégie
; Software\Policies\Orical\OricalPDF). L'icône des fichiers PDF (DefaultIcon de la classe = resources\pdf-file.ico, extraResources)
; n'apparaît que pour les PDF dont l'application par défaut, choisie par l'utilisateur, est Orical PDF. La version portable n'écrit aucune clé.

!include LogicLib.nsh
!include nsDialogs.nsh
!include FileFunc.nsh

!define ORICAL_PROGID "OricalPDF.pdf"
!define ORICAL_CAPS "Software\Orical\OricalPDF\Capabilities"

!ifndef BUILD_UNINSTALLER
!macro customInstall
  StrCpy $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr SHCTX "Software\Classes\${ORICAL_PROGID}" "" "Document PDF (Orical PDF)"
  WriteRegStr SHCTX "Software\Classes\${ORICAL_PROGID}\DefaultIcon" "" "$INSTDIR\resources\pdf-file.ico,0"
  WriteRegStr SHCTX "Software\Classes\${ORICAL_PROGID}\shell\open\command" "" '"$0" "%1"'
  WriteRegStr SHCTX "Software\Classes\.pdf\OpenWithProgids" "${ORICAL_PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "Orical PDF"
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".pdf" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$0" "%1"'
  WriteRegStr SHCTX "${ORICAL_CAPS}" "ApplicationName" "Orical PDF"
  WriteRegStr SHCTX "${ORICAL_CAPS}" "ApplicationDescription" "Lecteur et éditeur de documents PDF"
  WriteRegStr SHCTX "${ORICAL_CAPS}\FileAssociations" ".pdf" "${ORICAL_PROGID}"
  WriteRegStr SHCTX "Software\RegisteredApplications" "Orical PDF" "${ORICAL_CAPS}"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
!macroend
!endif

!ifdef BUILD_UNINSTALLER

Var OricalDelData
Var OricalDelBox

; Les fonctions sont définies DANS la macro : elle est développée avec les pages, après l'inclusion de MUI (MUI_HEADER_TEXT).
!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.oricalDataPage un.oricalDataPageLeave

Function un.oricalDataPage
  !insertmacro MUI_HEADER_TEXT "Données de l'utilisateur" "Réglages, documents récents, bibliothèque de tampons et de signatures"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 40u "Vos réglages et votre bibliothèque sont conservés : ils seront retrouvés si vous réinstallez Orical PDF. Cochez la case pour les supprimer aussi (dossier « $APPDATA\Orical PDF »)."
  Pop $0
  ${NSD_CreateCheckbox} 0 48u 100% 14u "Supprimer aussi mes réglages et ma bibliothèque"
  Pop $OricalDelBox
  ${If} $OricalDelData == "1"
    ${NSD_Check} $OricalDelBox
  ${EndIf}
  nsDialogs::Show
FunctionEnd

Function un.oricalDataPageLeave
  ${NSD_GetState} $OricalDelBox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $OricalDelData "1"
  ${Else}
    StrCpy $OricalDelData "0"
  ${EndIf}
FunctionEnd
!macroend

!macro customUnInstall
  ; Association « Ouvrir avec » : retirée dans tous les cas (une mise à jour la réécrit juste après). La valeur par défaut de .pdf n'est pas touchée.
  DeleteRegValue SHCTX "Software\Classes\.pdf\OpenWithProgids" "${ORICAL_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\${ORICAL_PROGID}"
  DeleteRegKey SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegValue SHCTX "Software\RegisteredApplications" "Orical PDF"
  DeleteRegKey SHCTX "Software\Orical\OricalPDF"
  DeleteRegKey /ifempty SHCTX "Software\Orical"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
  ${IfNot} ${isUpdated}
    ${GetParameters} $R0
    ClearErrors
    ${GetOptions} $R0 "/DELETEDATA=" $R1
    ${IfNot} ${Errors}
      StrCpy $OricalDelData $R1
    ${EndIf}
    ${If} $OricalDelData == "1"
      StrCpy $R2 "$APPDATA\Orical PDF"
      ClearErrors
      ${GetOptions} $R0 "/DATADIR=" $R3
      ${IfNot} ${Errors}
        ${If} ${FileExists} "$R3\.oricalpdf-test"
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
  ; Dossier d'installation resté VIDE : le modèle d'electron-builder fait « SetOutPath $INSTDIR » dans un.onInit, le dossier est donc le
  ; dossier courant du désinstalleur et son « RMDir /r $INSTDIR » ne peut pas le supprimer (vérifié : 4 désinstallations sur 4). On en sort,
  ; puis RMDir SANS /r : ne supprime le dossier que s'il est vide (jamais de fichier de l'utilisateur ; sans effet si des fichiers restent).
  SetOutPath "$TEMP"
  RMDir "$INSTDIR"
!macroend

!endif
