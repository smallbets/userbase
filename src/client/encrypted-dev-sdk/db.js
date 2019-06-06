/**

    Takes an object as input, encrypts the object client-side,
    then sends the encrypted object to the database for storage.

    Returns the item id of the object stored in the database
    as well as the sequence number of the write operation. A
    user's sequence number increases monotonically with each
    write operation to the database.

    Example call:

      db.insert({
        todo: 'remember the milk'
      }, function(err, product) {
        // asynchronously called
      });

    Response:

      item-id {String} - GUID for item inserted into the database
      sequence-no {Integer} - counter for user's write operations on the database

      Example:

        {
          'item-id': 'b09cf9c2-86bd-499c-af06-709d5c11f64b',
          'sequence-no': 1
        }
 */
const insert = async (object) => {
  console.log('Called insert object', object)
}

const update = async () => {
  console.log('Called update in client')
}

const deleteFunction = async () => {
  console.log('Called delete in client')
}

const query = async () => {
  console.log('Called item query in client')
}

export default {
  insert,
  update,
  'delete': deleteFunction,
  query
}
