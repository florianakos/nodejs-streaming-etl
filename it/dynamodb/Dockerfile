FROM amazon/dynamodb-local:latest

USER root

RUN yum install -y aws-cli && yum clean all

ENV AWS_REGION=eu-west-1
ENV AWS_ACCESS_KEY_ID=foo
ENV AWS_SECRET_ACCESS_KEY=bar
ENV AWS_SESSION_TOKEN=baz

COPY data /home/dynamodblocal/data
COPY entrypoint.sh /home/dynamodblocal

ENTRYPOINT ["/home/dynamodblocal/entrypoint.sh"]
