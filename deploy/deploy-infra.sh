#!/bin/bash

# Generate a personal access token with repo and admin:repo_hook permissions from https://github.com/settings/tokens
#Previously all file paths had prefix ./deploy/

ACCESS_TOKEN=$(cat ~/.git-token)
STACK_NAME=encd
REGION=us-east-1
CLI_PROFILE=$(cat ~/.cli_profile)
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile $CLI_PROFILE --output text | cut -f1)
CFN_BUCKET="$STACK_NAME-cfn-$AWS_ACCOUNT_ID"
#CFN_BUCKET=""
CODEPIPELINE_BUCKET="$STACK_NAME-codepipeline-$AWS_ACCOUNT_ID"
CF_BUCKET="$STACK_NAME-cloudformation-$AWS_ACCOUNT_ID"

#s3_command=$("aws s3 mb s3://userbase_bucket")

aws s3 mb s3://$CFN_BUCKET --region=$REGION --profile $CLI_PROFILE

aws cloudformation deploy \
  --profile $CLI_PROFILE \
  --stack-name $STACK_NAME-setup \
  --s3-bucket $CFN_BUCKET \
  --template-file cfn/setup.yml \
  --no-fail-on-empty-changeset \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    CodePipelineBucket=$CODEPIPELINE_BUCKET \
    CloudFormationBucket=$CF_BUCKET

mkdir -p ./cfn/output


PACKAGE_ERR="$(aws cloudformation package \
  --profile $CLI_PROFILE \
  --template cfn/main.yml \
  --s3-bucket $CFN_BUCKET \
  --output-template-file cfn/output/main.yml 2>&1)"

if ! [[ $PACKAGE_ERR =~ "Successfully packaged artifacts" ]]; then
  echo "ERROR while running 'aws cloudformation package' command:"
  echo $PACKAGE_ERR
  exit 1
fi

# Deploy the CloudFormation template
aws cloudformation deploy \
  --profile $CLI_PROFILE \
  --stack-name $STACK_NAME \
  --template-file cfn/output/main.yml \
  --no-fail-on-empty-changeset \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    GitHubOwner=dksaunder \
    GitHubRepo=userbase \
    GitHubBranch=master \
    GitHubPersonalAccessToken=$ACCESS_TOKEN \
    EC2StagingInstanceType=t2.micro \
    EC2DemoInstanceType=t2.micro \
    EC2AMI=ami-0aeeebd8d2ab47354 \
    Domain=dksaunder.com \
    Certificate=arn:aws:acm:us-east-1:996569927027:certificate/0ffc0e77-1197-4c5b-8ecb-bf6ef110ec30 \
    CodePipelineBucket=$CODEPIPELINE_BUCKET
