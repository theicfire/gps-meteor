getlogs:
	bash read_logs.sh

readlogs:
	grep -E "] (sendAndroidMessage|regid|sendSMS|sendRing|sendAlert|callsendRing|setglobalstate|handle_micro_msg)" final.log

.PHONY: getlogs
