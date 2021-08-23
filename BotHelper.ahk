#SingleInstance ignore
#Persistent  ; Keep this script running until the user explicitly exits it.
DetectHiddenWindows On 
SetTitleMatchMode 1 ; WinTitle starts with...	
  ; 2 ; WinTitle contains...	
  ; 3 ; WinTitle exact...	

SetTimer, BotHelper_WinWait, 10

;--------------------------------------------------------------------------
; Wait until window is open, then perform action
;--------------------------------------------------------------------------
BotHelper_WinWait:
{
	WinWait, % "BotHelper:"
	
	if(ErrorLevel == 0)
	{
		WinGetTitle, winTitle, % "BotHelper:"
		
    RegExMatch(winTitle, "O)BotHelper\:(.*)\((.*)\)", match)
    ;MsgBox % match.Value(1) " " match.Value(2)
    
    if(match.Value(1) = "SendText") {
      Send % match.Value(2)
    }

    if(match.Value(1) = "ClearCookies") {
      Send ^L
      Sleep 500
      Send +{Tab}
      Sleep 500      
      Send {Enter}
      Sleep 500

      Loop 3 {
        Send {Tab}
        Sleep 500
      }
      Send {Enter}
      Sleep 500

      Loop 4 {
        Send {Tab}
        Sleep 500
      }
      Send {Enter down}
      Sleep 5000
      Send {Enter up}      
      Sleep 500

      Send {Enter}
    }
    
    WinSetTitle, % "BotHelper:",, % "Updated"

		SetTimer, BotHelper_WinWait, 10
	}
	
	return
}
