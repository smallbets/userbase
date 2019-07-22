import aws from 'aws-sdk'
import util from 'util'
import keygen from 'ssh-keygen'

(async () => {
  try {
    // capitalize the first letter of the argument and lowercase the rest
    const stage = process.argv[2].charAt(0).toUpperCase() + process.argv[2].slice(1).toLowerCase()

    // look for AWS credentials under the 'encrypted' profile
    const profile = 'encrypted'

    // create a custom AWS credentials chain to provide the custom profile
    const chain = new aws.CredentialProviderChain([
      function () { return new aws.EnvironmentCredentials('AWS') },
      function () { return new aws.EnvironmentCredentials('AMAZON') },
      function () { return new aws.SharedIniFileCredentials({ profile }) },
      function () { return new aws.ECSCredentials() },
      function () { return new aws.ProcessCredentials({ profile }) },
      function () { return new aws.EC2MetadataCredentials() }
    ])

    aws.config.credentials = await chain.resolvePromise()
    aws.config.update({ region: 'us-west-2' })

    const ec2 = new aws.EC2()
    const ec2connect = new aws.EC2InstanceConnect()

    // find the EC2 instance for the specified stage
    const instances = await ec2.describeInstances({
      Filters: [{ Name: 'tag:aws:cloudformation:stack-name', Values: [`encd-${stage}-*`] }]
    }).promise()

    const instanceId = instances.Reservations[0].Instances[0].InstanceId
    const publicDns = instances.Reservations[0].Instances[0].PublicDnsName
    const az = instances.Reservations[0].Instances[0].Placement.AvailabilityZone

    // generate a new rsa key using openssl and put the key pair in /tmp
    const rsaKeyPair = await (util.promisify(keygen))({ location: '/tmp/ec2connect' })

    // send the public key to EC2 to allow ssh with the private key
    await ec2connect.sendSSHPublicKey({
      AvailabilityZone: az,
      InstanceId: instanceId,
      InstanceOSUser: 'ec2-user',
      SSHPublicKey: rsaKeyPair.pubKey
    }).promise()

    // return the public dns name to the caller via stdout
    console.log(publicDns)

    // the caller can now ssh to the instances like this:
    //     ssh -i /tmp/ec2connect ec2-user@$DNS
  } catch (e) {
    console.error(`Unhandled error: ${e}`)
  }
})()
