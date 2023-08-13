# ChiaDLFileStore

ChiaDLFileStore is a Node.js package that provides functionality for interacting with Chia blockchain's DataLayer to manage files.

## Installation

```bash
npm install chia-dl-file-store
```

## Usage

```javascript
const ChiaDLFileStore = require('chia-dl-file-store');

// Create an instance of ChiaDLFileStore
const fileStore = new ChiaDLFileStore();
```

## Configuration

The `ChiaDLFileStore` constructor accepts an optional configuration object. Here are the available configuration options along with their default values:

- `getRpcMaxConnections` (default: `5`): Maximum number of concurrent RPC connections to get a splitted file.
- `timeoutPending` (default: `5000`): Timeout value for checking pending request.
- `certPath` (default: auto-generated based on the user's home directory and Chia configuration): Path to the SSL certificate file.
- `keyPath` (default: auto-generated based on the user's home directory and Chia configuration): Path to the SSL key file.
- `host` (default: `'localhost'`): Hostname for the RPC server.
- `port` (default: `8562`): Port number for the RPC server.
- `chunkSize` (default: `2000000`): Size of each data chunk in bytes (2MB).

```javascript
const config = {
    getRpcMaxConnections: 10,
    timeoutPending: 10000,
    certPath: '/path/to/cert/file.crt',
    keyPath: '/path/to/key/file.key',
    host: 'localhost',
    port: 8562,
    chunkSize: 2000000, // 2MB
};

const fileStore = new ChiaDLFileStore(config);
```

## API Documentation

### `getFileList(idStore)`

Description: Retrieve the list of files in the data store.

- `idStore`: Identifier of the data store.

Returns:
- `success`: Whether the operation was successful.
- `fileList`: List of files in the data store.

### `getFile(idStore, fileName)`

Description: Retrieve a file from the data store.

- `idStore`: Identifier of the data store.
- `fileName`: Name of the file to retrieve.

Returns:
- `success`: Whether the operation was successful.
- `message`: Status message.
- `hexFile`: Hex-encoded content of the file.

### `insertFile(idStore, filePath, fee)`

Description: Insert a file into the data store.

- `idStore`: Identifier of the data store.
- `filePath`: Path to the file to be inserted.
- `fee`: Transaction fee (optional).

Returns:
- `success`: Whether the operation was successful.
- `message`: Status message.

### `createDataStore(fee)`

Description: Create a new data store.

- `fee`: Transaction fee (optional).

Returns:
- `success`: Whether the operation was successful.
- `message`: Status message

### `cancelProcess()`

Description: Cancel the ongoing  process insertion / getfile.

### `deleteFile(idStore, fileName, fee)`

Description: Delete a file from the data store.

- `idStore`: Identifier of the data store.
- `fileName`: Name of the file to delete.
- `fee`: Transaction fee (optional).

Returns:
- `success`: Whether the operation was successful.
- `message`: Status message.

## Events

`ChiaDLFileStore` is an EventEmitter and emits the following events:

- `logGetFile`: Logged when a file is being retrieved.
- `logInsertFile`: Logged when a file is being inserted.

```javascript
fileStore.on('logGetFile', (fileName, partNumber, hexData, message) => {
    console.log(`Getting ${partNumber}/${totalParts} of ${fileName}: ${message}`);
});

fileStore.on('logInsertFile', (fileName, partNumber, message) => {
    console.log(`Inserting ${partNumber} of ${fileName}: ${message}`);
});
```

## Examples

### Get File List

```javascript
const ChiaDLFileStore = require('chia-dl-file-store');

async function getFileListExample() {
    const fileStore = new ChiaDLFileStore();
    
    try {
        const idStore = '2feb86ae33d70bfec5662a6ddac515542002e8afddffb91a06aeae9d5e68e07d';
        const result = await fileStore.getFileList(idStore);
        if(!result.success) {
            return;
        }
        for(const file of result.fileList) {
            console.log("File name: ", file);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

getFileListExample();
```

### Insert File

```javascript
const ChiaDLFileStore = require('chia-dl-file-store');

async function insertFileExample() {
    const fileStore = new ChiaDLFileStore();


    fileStore.on('logInsertFile', (fileName, partNumber, message) => {
        console.log(`log ${partNumber} of ${fileName}: ${message}`);
    });

    try {
        const idStore = '2feb86ae33d70bfec5662a6ddac515542002e8afddffb91a06aeae9d5e68e07d';
        const filePath = "PathTofile";
        const fee = 100;
        const result = await fileStore.insertFile(idStore, filePath, fee);
       if(result.success) {
           console.log('Success:', result.message);
           return;
       }
       console.error('Error:', result.error);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

insertFileExample();
```

### Get File

```javascript
const ChiaDLFileStore = require('chia-dl-file-store');
const path = require('path');
const fs = require('fs');

async function getFileExample() {
    const fileStore = new ChiaDLFileStore();

    try {
        const idStore = '2feb86ae33d70bfec5662a6ddac515542002e8afddffb91a06aeae9d5e68e07d';
        const fileName = 'FILENAME.ANYTHING';
        const result = await fileStore.getFile(idStore, fileName);

        if (result.success === true) {
            const filePath = path.join(__dirname, fileName);
            fs.writeFileSync(filePath, result.hexFile, 'hex');
            console.log('File retrieved and saved:', filePath);
        } else {
            console.error('Error:', result.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

getFileExample();
```
### Delete File
```
const ChiaDLFileStore = require('chia-dl-file-store');

async function deleteFileExample() {
    const fileStore = new ChiaDLFileStore();

    try {
        const idStore = '2feb86ae33d70bfec5662a6ddac515542002e8afddffb91a06aeae9d5e68e07d';
        const fileName = 'demod2.png';
        const result = await fileStore.deleteFile(idStore, fileName,100);
        
        if (result.success === true) {
            console.log('File deleted successfully');
        } else {
            console.error('Error deleting file:', result.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}
deleteFileExample();

```
### Cancel Process insertFile / getFile 
```
const ChiaDLFileStore = require('chia-dl-file-store');

async function cancelProcessExample() {
    const fileStore = new ChiaDLFileStore();

    try {
        await fileStore.cancelProcess();
        console.log('process cancelled');
    } catch (error) {
        console.error('Error:', error.message);
    }
}
cancelProcessExample();

```

### Create Store
```
const ChiaDLFileStore = require('chia-dl-file-store');

async function createDataStoreExample() {
    const fileStore = new ChiaDLFileStore();

    try {
        const result = await fileStore.createDataStore(100);
        if(result.success) {
            console.log('Data store created with ID:', result.id);
        }
        else {  
            console.error('Error:', result.error);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}
createDataStoreExample();

```
## Usage Notes and Limitations

### Inserting Large Files

When inserting large files into the data store, please be patient as each part of the file is being inserted. If the upload process is interrupted, you can resume the insertion process, and it will continue from where it left off.

It's important to note that when inserting a large file that will be split into multiple parts, the insertion should occur continuously in the hash history. If the insertion process is interrupted and another file insertion is initiated, the interrupted file's data might become unreadable. In such cases, it's recommended to delete the interrupted file and reinsert it from the beginning.

This limitation is due to the reliance on the hash history to ensure the integrity and consistency of data stored in the data store. Interrupting the insertion process and mixing it with another insertion can result in an inconsistent state.

To avoid these issues, it's advisable to ensure the continuous and uninterrupted insertion of each file part into the hash history until the insertion is complete.

The package has been successfully tested with chunk sizes of 2MB and 10MB. However, when attempting to insert files larger than 10MB, such as 15MB, 20MB, or 25MB, you might encounter an error message indicating that the request size limit has been exceeded.

Example error message: "Maximum request body size 26214400 exceeded, actual body size 26279790"

## Support and Donations

If you find this package helpful or valuable, consider showing your appreciation by making a donation to the following Chia wallet address:

Wallet Address: `xch1flkl7v6uhxepk5se3542478e38m0t20wchjp28gwxeglzxvmzdnq2hh33d`

Your support helps to motivate ongoing development and maintenance of this package. Even a small contribution can make a difference and encourage further improvements.

Thank you for your support!