#SingleInstance ignore
#Persistent  ; Keep this script running until the user explicitly exits it.
DetectHiddenWindows On 
SetTitleMatchMode 1 ; WinTitle starts with...	
  ; 2 ; WinTitle contains...	
  ; 3 ; WinTitle exact...	

SetTimer, BotHelper_WinWait, -10

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
      delay := 100
      Send ^l
      Sleep % delay      
      
      Send +{Tab}
      Sleep % delay      
      Send {Enter}
      Sleep % delay

      Loop 4 {
        Send {Tab}
        Sleep % delay
      }
      Send {Enter}
      Sleep % delay * 3

      
      Loop 4 {
        Send {Tab}
        Sleep % delay
      }

      Sleep 500

      /*
      Send {Enter down}
      Sleep 5000
      Send {Enter up}
      Send {Escape}
      */

      Loop {
        ImageSearch, X, Y, 0, 0, 1500, 1000, *50 remove.button.bmp

        if (ErrorLevel = 0) {
          ;Click %X%, %Y%
          Send {Enter}
          Sleep % delay * 5
        } else {
          break
        }
      }

      Send {Escape}

      /*
      Send {Tab}
      Sleep % delay
      Send {Tab}
      Sleep % delay

      
      Loop 30 {
        ImageSearch, OutputVarX, OutputVarY, 0, 0, 1000, 1000, *110 hulu.com.1.bmp

        ;msgbox % ErrorLevel

        if(ErrorLevel = 0) {
          Send {Tab}
          Sleep % delay
          Send {Tab}
          Sleep % delay
          Send {Enter}
          Sleep % delay
          Send +{Tab}
          Sleep % delay
          Send +{Tab}
          Sleep % delay
        } else {
          Send {Down}
          Sleep % delay
        }        
      }
      Send {Escape}
      */

      /*
      Loop 4 {
        Send {Tab}
        Sleep 500
      }
      Send {Enter}
      Sleep 500

      Loop 4 {
        Send {Tab}
        Sleep 500
      }

      Loop 100 {
        Send {Enter}  
      }
      /*
      Send {Enter down}
      Sleep 5000
      Send {Enter up}
      
      Sleep 500
      Send {Tab}
      Sleep 500

      Send {Enter}
      */
    }
    
    WinSetTitle, % "BotHelper:",, % "Updated"

		SetTimer, BotHelper_WinWait, -1000
	}
	
	return
}
