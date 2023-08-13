const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');
const { Worker, isMainThread, parentPort } = require('worker_threads');


class ChiaDLFileStore extends EventEmitter {
    constructor(config = null) {
        super();
        const defaultConfig = {
            getRpcMaxConnections: 10,
            timeoutPending: 5000,
            certPath: this.getDefaultCertPath(),
            keyPath: this.getDefaultKeyPath(),
            host: 'localhost',
            port: 8562,
            chunkSize: 5000000,//5MB
            requestOptions: {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                rejectUnauthorized: false,
                timeout: 30000
            },
        };

        this.config = { ...defaultConfig, ...config };
        if (!fs.existsSync(this.config.certPath)) {
            console.warn(`Warning: Certificate file not found: ${this.config.certPath}`);
            return;
        }
        if (!fs.existsSync(this.config.keyPath)) {
            console.warn(`Warning: Key file not found: ${this.config.keyPath}`);
            return;
        }
        this.config.requestOptions.cert = fs.readFileSync(this.config.certPath);
        this.config.requestOptions.key = fs.readFileSync(this.config.keyPath);
        this.cancelFlag = false;
    }
    getDefaultCertPath() {
        const homeDir = os.homedir();
        return path.join(homeDir, '.chia', 'mainnet', 'config', 'ssl', 'data_layer', 'private_data_layer.crt');
    }
    getDefaultKeyPath() {
        const homeDir = os.homedir();
        return path.join(homeDir, '.chia', 'mainnet', 'config', 'ssl', 'data_layer', 'private_data_layer.key');
    }
    cancelProcess() {
        this.cancelFlag = true;
    }
    async deleteFile(idStore, fileName, fee = 0) {
        try {
            const requestBody = {
                id: idStore,
                key: this.stringToHex(fileName),
                fee: fee
            };
            const result = await this.call('delete_key', requestBody);
            return result;
        } catch (error) {
            return { success: false, error: 'Error', dataError: error };
        }
    }
    async getFileList(idStore) {
        try {
            const requestBody = {
                id: idStore
            };
            const result = await this.call('get_keys', requestBody);

            if (!result.success) {
                return result;
            }

            const keys = result.keys.map(hexKey => this.hexToString(hexKey.substr(2)));
            return { success: true, fileList: keys };
        } catch (error) {
            return { success: false, error: 'Error', dataError: error };
        }
    }
    async getRootHistoryFile(idStore, secondRootHash, totalParts) {
        try {
            const rootHistory = await this.call('get_root_history', { id: idStore });

            if (!rootHistory.success) {
                return [];
            }

            const startHistoryIndex = rootHistory.root_history.findIndex(entry => entry.root_hash === secondRootHash);

            if (startHistoryIndex === -1) {
                return [];
            }

            const rootHistoryParts = rootHistory.root_history.slice(startHistoryIndex - (totalParts - 2), startHistoryIndex + 1);
            return rootHistoryParts.reverse();
        } catch (error) {
            return [];
        }
    }
    async getFileSingleThread(idStore, fileName) {
        try {
            let storedFile = await this.getKeValue(idStore, fileName);

            if (!storedFile.success) {
                return storedFile;
            }
            let infoFileParsed = JSON.parse(this.hexToString(storedFile.value));
            const totalParts = infoFileParsed.totalParts;
            const fileContentChunks = [];
            let rootHistory = [];
            fileContentChunks.push(infoFileParsed.hexData);
            this.emit('logGetFile', fileName, infoFileParsed.partNumber, infoFileParsed.hexData, `Get ${infoFileParsed.totalParts == 1 ? 'Full' : 'Part'} file...` + infoFileParsed.partNumber + '/' + totalParts);
            if (infoFileParsed.nextRootHash != null) {
                rootHistory = await this.getRootHistoryFile(idStore, infoFileParsed.nextRootHash, totalParts);
                if (rootHistory.length === 0) {
                    return { success: false, error: 'Root History not found' };
                }
            }
            const concurrencyLimit = this.config.getRpcMaxConnections;
            let activeConnections = 0;
            const promises = rootHistory.map(async root => {
                if (this.cancelFlag) {
                    return;
                }
                while (activeConnections >= concurrencyLimit) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    if (this.cancelFlag) {
                        return;
                    }
                }
                activeConnections++;

                try {
                    const storedFile = await this.getKeValue(idStore, fileName, root.root_hash);
                    if (storedFile.success) {
                        infoFileParsed = JSON.parse(this.hexToString(storedFile.value));
                        fileContentChunks[infoFileParsed.partNumber - 1] = infoFileParsed.hexData;
                        this.emit('logGetFile', fileName, infoFileParsed.partNumber, infoFileParsed.hexData, 'Get Part file...' + fileContentChunks.filter(chunk => chunk !== null).length + '/' + totalParts);
                    }
                    activeConnections--;
                } catch (error) {
                    activeConnections--;
                }
            });

            await Promise.all(promises);
            let totalPartsInChunks = fileContentChunks.filter(chunk => chunk !== null).length;
            if (totalPartsInChunks != totalParts) {
                return { success: false, error: 'File incomplete...' + totalPartsInChunks + '/' + totalParts };
            }
            const fullFileContent = fileContentChunks.join('');


            return { success: true, message: 'File Loaded', hexFile: fullFileContent };
        } catch (error) {
            return { success: false, error: 'Error', dataError: error };
        }
    }
    async getFile(idStore, fileName) {
        return new Promise(async (resolve, reject) => {
            try {
                let storedFile = await this.getKeValue(idStore, fileName);

                if (!storedFile.success) {
                    resolve(storedFile);
                }
                let infoFileParsed = JSON.parse(this.hexToString(storedFile.value));
                const totalParts = infoFileParsed.totalParts;
                const fileContentChunks = [];
                let rootHistory = [];
                fileContentChunks.push(infoFileParsed.hexData);
                this.emit('logGetFile', fileName, infoFileParsed.partNumber, infoFileParsed.hexData, `Get ${infoFileParsed.totalParts == 1 ? 'Full' : 'Part'} file...` + infoFileParsed.partNumber + '/' + totalParts);
                if (infoFileParsed.nextRootHash != null) {
                    rootHistory = await this.getRootHistoryFile(idStore, infoFileParsed.nextRootHash, totalParts);
                    if (rootHistory.length === 0) {
                        resolve({ success: false, error: 'Root History not found' });
                    }
                }
                if (rootHistory.length === 0 && totalParts === 1) {
                    resolve({ success: true, message: 'File Loaded', hexFile: infoFileParsed.hexData });
                    return;
                }
                if (rootHistory.length === 0 && totalParts > 1) {
                    resolve({ success: false, error: 'Root History not found' });
                    return;
                }
                const concurrencyLimit = this.config.getRpcMaxConnections;
                let activeConnections = 0;
                const workerScriptPath = path.join(__dirname, 'getChunkWorker.js');
                const workers = [];
                let responseCount = 0;
                const handleResponse = (workerIndex, message) => {
                    responseCount++;
                    activeConnections--;
                    fileContentChunks[message.partNumber - 1] = message.success ?  message.hexData: null;
                    if (message.success === true) {
                        this.emit('logGetFile', fileName, message.partNumber, message.hexData, 'Get Part file...' + fileContentChunks.filter(chunk => chunk !== null).length + '/' + totalParts);
                    }
                    workers[workerIndex].terminate();
                    if(responseCount === rootHistory.length) {
                        let totalPartsInChunks = fileContentChunks.filter(chunk => chunk !== null).length;
                        if (totalPartsInChunks != totalParts) {
                            resolve({ success: false, error: 'File incomplete...' + totalPartsInChunks + '/' + totalParts });
                            return;
                        }
                        const fullFileContent = fileContentChunks.join('');
                        resolve({ success: true, message: 'File Loaded', hexFile: fullFileContent });
                    }
                };

                for (let i = 0; i < rootHistory.length; i++) {
                    while (activeConnections >= concurrencyLimit) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                        if (this.cancelFlag) {
                            this.terminateWorkers(workers);
                            resolve({ success: false, error: 'Canceled by user' });
                        }
                    }
                    const worker = new Worker(workerScriptPath);
                    workers.push(worker);

                    worker.on('message', message => {
                        handleResponse(i, message);
                    });
                    worker.on('error', error => {
                        handleResponse(i, { success: false, error: error.message ?? error });
                    });
                    let rootHash = rootHistory[i].root_hash;
                    worker.postMessage({idStore, fileName, rootHash});
                    activeConnections++;
                }

            }
            catch (error) {
                resolve({ success: false, error: error.message ?? error });
            }
        });
    }
    terminateWorkers(workers) {

        for (let i = 0; i < workers.length; i++) {
            try {
                workers[i].terminate();
            } catch (error) {

            }
        }
    }
    hexToString = function (hex) {
        var string = '';
        for (var i = 0; i < hex.length; i += 2) {
            var byte = parseInt(hex.substr(i, 2), 16);
            string += String.fromCharCode(byte);
        }
        return string;
    }
    stringToHex = function (text) {
        var hexString = "";

        for (var i = 0; i < text.length; i++) {
            var hex = text.charCodeAt(i).toString(16);
            hexString += (hex.length === 2 ? hex : "0" + hex);
        }

        return hexString;
    }
    async call(endPoint, requestBody = {}) {
        if (typeof requestBody.fee === 'undefined') {
            requestBody.fee = 0;
        }
        return new Promise((resolve, reject) => {
            try {
                const req = https.request(`https://${this.config.host}:${this.config.port}/${endPoint}`, this.config.requestOptions, response => {
                    let data = '';
                    response.on('data', chunk => {
                        data += chunk;
                    });

                    response.on('end', () => {
                        try {
                            data = JSON.parse(data);
                        }
                        catch {

                        }
                        resolve(data);
                    });
                });

                req.on('error', error => {
                    if (error.code === 'ECONNREFUSED') {
                        resolve({ success: false, error: 'Connection refused' });
                        return;
                    }
                    resolve({ success: false, error: 'Unknown error', dataError: error });
                });
                req.write(JSON.stringify(requestBody));
                req.end();
            }
            catch (error) {
                resolve({ success: false, error: 'Unknown error', dataError: error });
            }
        });
    }
    async createDataStore(fee = 0) {
        const requestBody = {
            fee: fee,
        };
        return this.call('create_data_store', requestBody);
    }
    sleep = function () {
        return new Promise(resolve => setTimeout(resolve, this.config.timeoutPending));
    }
    getChunkData = function (filePath, chunkIndex) {
        const fileDescriptor = fs.openSync(filePath, 'r');
        const buffer = Buffer.alloc(this.config.chunkSize);
        const bytesRead = fs.readSync(fileDescriptor, buffer, 0, this.config.chunkSize, chunkIndex * this.config.chunkSize);
        fs.closeSync(fileDescriptor);
        return buffer.slice(0, bytesRead);
    }
    async getKeValue(idStore, keyString, rootHash = null) {
        const requestBody = {
            id: idStore,
            key: this.stringToHex(keyString),
            root_hash: rootHash,
        };
        return this.call('get_value', requestBody);
    }
    async getLastHashRoot(idStore) {
        const requestBody = {
            id: idStore,
        };
        const result = await this.call('get_root_history', requestBody);
        if (result.success === false) {
            return null;
        }
        return result.root_history.pop();
    }
    async insertFile(idStore, filePath, fee = 0) {
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: 'File not found :' + filePath };
            }
            const rootHistory = await this.call('get_root_history', { id: idStore });
            if (rootHistory.success === false) {
                return rootHistory;
            }
            if (rootHistory.success === true && rootHistory.root_history.length == 0) {
                return { success: false, error: 'Data store not found' };
            }
            let lastRootHash = rootHistory.root_history.pop();
            if (rootHistory.root_history == 1 && lastRootHash.confirmed === false) {
                return { success: false, error: rootHistory.root_history == 1 ? 'Data store not confirmed' : 'Pending transaction' };
            }

            const fileName = path.basename(filePath);
            const fileNameHex = this.stringToHex(fileName);
            const fileContent = fs.readFileSync(filePath);
            const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
            const fileSize = fileContent.length;
            const totalParts = Math.ceil(fileSize / this.config.chunkSize);
            const storedFile = await this.getKeValue(idStore, path.basename(filePath));
            let infoFileParsed = storedFile.success === true ? JSON.parse(this.hexToString(storedFile.value)) : null;
            let nextRootHash = storedFile.success === true ? infoFileParsed.nextRootHash : null;
            let partNumber = storedFile.success === true ? infoFileParsed.partNumber - 1 : totalParts;

            if (storedFile.success === true && infoFileParsed.Hash !== fileHash) {
                return { success: false, error: 'Hash file not match ' };
            }
            if (storedFile.success === true && infoFileParsed.partNumber === 1) {
                return { success: false, error: 'File already stored' };
            }
            let fileProperties = {
                size: fileSize,
                Hash: fileHash,
                nextRootHash: nextRootHash,
                partNumber: partNumber,
                totalParts: totalParts,
                hexData: this.getChunkData(filePath, partNumber - 1).toString('hex'),
            }
            //first chunk
            if (partNumber === totalParts) {
                const requestBody = {
                    id: idStore,
                    key: fileNameHex,
                    value: this.stringToHex(JSON.stringify(fileProperties)),
                    fee: fee,
                };
                const result = await this.call('insert', requestBody);
                if (result.success === false)
                    return result;
                this.emit('logInsertFile', fileName, partNumber, 'Insert Part file...' + (totalParts - partNumber + 1) + '/' + totalParts);
            }
            let resultBatch = { success: true };
            while (partNumber !== 0 && resultBatch.success === true) {
                if (this.cancelFlag === true) {
                    this.cancelFlag = false;
                    return { success: false, error: 'Cancel by user' };
                }
                //check if a transaction is pending
                let newHashRoot = await this.getLastHashRoot(idStore);
                nextRootHash = newHashRoot.root_hash ?? null;
                if (newHashRoot === null)
                    return { success: false, error: 'Error get root history...' + (totalParts - partNumber + 1 + '/' + totalParts) };
                let isTransactionConfirmed = newHashRoot.confirmed;
                while (isTransactionConfirmed === false) {
                    if (this.cancelFlag === true) {
                        this.cancelFlag = false;
                        return { success: false, error: 'Cancel by user' };
                    }
                    this.emit('logInsertFile', fileName, partNumber, 'Pending transaction...' + (totalParts - partNumber + 1) + '/' + totalParts);
                    newHashRoot = await this.getLastHashRoot(idStore);
                    if (newHashRoot === null)
                        return { success: false, error: 'Error get root history...' + (totalParts - partNumber + 1 + '/' + totalParts) };
                    isTransactionConfirmed = newHashRoot.confirmed;
                    if (isTransactionConfirmed === true) {
                        this.emit('logInsertFile', fileName, partNumber, 'Transaction confirmed...' + (totalParts - partNumber + 1) + '/' + totalParts);
                        partNumber--;
                        if (partNumber === 0) {
                            return { success: true, error: 'File stored in data layer' };
                        }
                    }
                    await this.sleep();
                }
                fileProperties.nextRootHash = nextRootHash;
                fileProperties.partNumber = partNumber;
                fileProperties.hexData = this.getChunkData(filePath, partNumber - 1).toString('hex');
                const requestBody = {
                    id: idStore,
                    changelist: [{
                        action: 'delete',
                        key: fileNameHex
                    },
                    {
                        action: 'insert',
                        key: fileNameHex,
                        value: this.stringToHex(JSON.stringify(fileProperties)),
                    }],
                    fee: fee,
                };
                resultBatch = await this.call('batch_update', requestBody);
                if (resultBatch.success === false)
                    return { success: false, error: 'Error batch...' + (totalParts - partNumber + 1 + '/' + totalParts) + " " + resultBatch.error ?? '' };
                this.emit('logInsertFile', fileName, partNumber, 'Insert Part file...' + (totalParts - partNumber + 1) + '/' + totalParts);
            }
            if (partNumber !== 0){
                return { success: false, error: 'Error batch...' + (totalParts - partNumber + 1 + '/' + totalParts) + " " + resultBatch };
            }
            return { success: true, message: 'File stored in data layer' };

        } catch (error) {
            return { success: false, error: 'error', dataError: error };
        }
    }
}
module.exports = ChiaDLFileStore;