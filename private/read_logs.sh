#!/usr/bin/env bash

set -o errexit
set -o pipefail
set -o nounset
set -o xtrace

rm -rf logs
mkdir logs
scp root@gps.chaselambda.com:/var/log/upstart/gps.log* logs/
gunzip logs/gps.log.*
find . -name gps.* | sort -r | xargs cat > final.log
rm -rf logs
