' Runs a .bat with no window (for the scheduled Echo Lab jobs): wscript hidden.vbs "full path of job.bat"
CreateObject("WScript.Shell").Run """" & WScript.Arguments(0) & """", 0, True
