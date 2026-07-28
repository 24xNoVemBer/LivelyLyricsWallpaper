Set Fso = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
ScriptDir = Fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "pythonw """ & Fso.BuildPath(ScriptDir, "media_helper.py") & """", 0, False
