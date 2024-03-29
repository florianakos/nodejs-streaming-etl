#!/bin/bash
set -e

java -jar DynamoDBLocal.jar -inMemory -sharedDb &

AWS="aws --endpoint-url http://localhost:8000"
until $AWS dynamodb list-tables &>/dev/null; do
  >&2 echo "Waiting for DynamoDB to start up ..."
  sleep 1
done

for table in devices devices-extras; do
  $AWS dynamodb create-table --table-name "${table}" \
    --attribute-definitions AttributeName=device_id,AttributeType=S AttributeName=customer_id,AttributeType=S \
    --key-schema AttributeName=device_id,KeyType=HASH AttributeName=customer_id,KeyType=RANGE \
    --provisioned-throughput ReadCapacityUnits=50,WriteCapacityUnits=50
  $AWS dynamodb batch-write-item --request-items "file://./data/${table}.json"
done

tail -f /dev/null
