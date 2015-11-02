#!/bin/bash

site="chasegps.meteor.com"
name="$(meteor mongo --url $site)"
echo $name

IFS='@' read -a mongoString <<< "$name"

echo "HEAD: ${mongoString[0]}"
echo "TAIL: ${mongoString[1]}"

IFS=':' read -a pwd <<< "${mongoString[0]}"

echo "${pwd[1]}"
echo "${pwd[1]:2}"
echo "${pwd[2]}"


IFS='/' read -a site <<< "${mongoString[1]}"

echo "${site[0]}"
echo "${site[1]}"


mongodump -u ${pwd[1]:2} -h ${site[0]} -d ${site[1]}\
          -p ${pwd[2]}
