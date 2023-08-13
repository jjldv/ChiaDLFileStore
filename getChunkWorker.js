const { parentPort } = require('worker_threads');
const ChiaDLFileStore = require('./ChiaDLFileStore');

parentPort.on('message', async ({ idStore, fileName, rootHash }) => {
    const tool = new ChiaDLFileStore();
    const storedFile = await tool.getKeValue(idStore, fileName, rootHash);
    if (storedFile.success) {
        infoFileParsed = JSON.parse(tool.hexToString(storedFile.value));
        parentPort.postMessage({success: true, hexData: infoFileParsed.hexData, partNumber: infoFileParsed.partNumber });
    }
    else{
        parentPort.postMessage({success: false });
    }
});