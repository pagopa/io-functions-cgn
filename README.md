# IO Functions CGN

Azure Functions dedicated to CGN's project (Carta Giovani Nazionale).
These functions implements business logic for:
- Card activation
- Card revocation
- Card expiration 

also providing an integration through **EYCA (European Youth Card Association)** 

## Local development

```shell
cp env.example .env
```

Replace in `.env` file the envs with the proper values.

```shell
yarn install
yarn build
docker-compose up -d --build
docker-compose logs -f functions
open http://localhost/some/path/test
```

## Deploy

Deploy appens with this [pipeline](./azure-pipelines.yml)
(workflow) configured on [Azure DevOps - io-functions-cgn](https://dev.azure.com/pagopa-io/io-functions-cgn).

## Environment variables

Those are all Environment variables needed by the application:

| Variable name                            | Description                                                                       | type   |
|------------------------------------------|-----------------------------------------------------------------------------------|--------|
| CGN_STORAGE_CONNECTION_STRING            | Storage connection string                                                         | string |
| SLOT_TASK_HUBNAME                        | The unique slot task hubname                                                      | string |
| COSMOSDB_URI                             | URI for the cosmos database                                                       | string |
| COSMOSDB_KEY                             | Key for the cosmos database                                                       | string |
| COSMOSDB_NAME                            | Name for the cosmos database                                                      | string |
| CGN_EXPIRATION_TABLE_NAME                | Name for table storage used to store CGN card expirations                         | string |
| EYCA_EXPIRATION_TABLE_NAME               | Name for table storage used to store EYCA card expirations                        | string |
| EYCA_API_BASE_URL                        | The EYCA's CCDB API Base URL                                                      | string |
| EYCA_API_PASSWORD                        | The EYCA's CCDB API's account password                                            | string |
| EYCA_API_USERNAME                        | The EYCA's CCDB API's account username                                            | string |
| OTP_TTL_IN_SECONDS                       | The number of seconds through an OTP is still valid                               | number |
| REDIS_URL                                | The Redis instance URL                                                            | string |
| REDIS_TLS_ENABLED                        | `OPTIONAL` Enable TLS on Redis connection. It accepts `true` or `false`. If undefined it will be considered `true`.        | string |
