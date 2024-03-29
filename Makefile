ifndef DB_PORT
	DB_PORT := $(shell shuf -n 1 -i 50000-65535)
endif

ifndef DYNAMO_PORT
	DYNAMO_PORT := $(shell shuf -n 1 -i 30000-49999)
endif

ifndef DDB_ENDPOINT
	DDB_ENDPOINT := http:/localhost:$(DYNAMO_PORT)
endif

export DB_PORT
export DYNAMO_PORT
export DDB_ENDPOINT

.PHONY: all
all: clean install test build

.PHONY: clean
clean:
	rm -rf node_modules test-reports dist

.PHONY: format
format: install
	npm run format

.PHONY: install
install:
	npm install

.PHONY: build
build: install
	npm run build

.PHONY: db-up
db-up:
	docker-compose -f it/docker-compose.yaml up -d --build --remove-orphans --force-recreate

.PHONY: db-down
db-down:
	docker-compose -f it/docker-compose.yaml down --volumes --timeout 30

.PHONY: test
test: install db-down db-up
	until docker exec $$(docker-compose -f it/docker-compose.yaml ps -q postgres) pg_isready; do sleep 1; done
	npm run test
	docker-compose -f it/docker-compose.yaml down --volumes --timeout 30