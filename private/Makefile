getlogs:
	bash read_logs.sh

readlogs:
	grep -E "] (connection|setglobalstate)" final.log  | less

.PHONY: getlogs
