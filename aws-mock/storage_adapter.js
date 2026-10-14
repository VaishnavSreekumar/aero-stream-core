/**
 * Airbus Digital Aircraft Delivery - AWS Mock Storage Adapter Layer
 * Simulates Amazon S3 telemetry log storage and Amazon DynamoDB compliance persistence.
 */

const fs = require('fs');
const path = require('path');

class MockS3Service {
  constructor(bucketName = 'airbus-telemetry-archive') {
    this.bucketName = bucketName;
    this.storage = new Map();
    this.localDir = path.join(__dirname, 'mock_data', 's3', bucketName);

    try {
      if (!fs.existsSync(this.localDir)) {
        fs.mkdirSync(this.localDir, { recursive: true });
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Simulates AWS S3 PutObjectCommand
   * @param {string} key - S3 Object Key (e.g., telemetry/2026/10/14/39AC47_1728900000.json)
   * @param {object|string} body - Payload to persist
   * @param {object} metadata - Extra headers/tags
   */
  async putObject(key, body, metadata = {}) {
    const serialized = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
    this.storage.set(key, {
      body: serialized,
      metadata,
      eTag: `"${Math.random().toString(36).substring(2)}"`,
      lastModified: new Date().toISOString()
    });

    try {
      const filePath = path.join(this.localDir, key.replace(/\//g, '_'));
      fs.writeFileSync(filePath, serialized, 'utf8');
    } catch (err) {
      // In-memory fallback
    }

    return {
      bucket: this.bucketName,
      key,
      eTag: this.storage.get(key).eTag,
      versionId: 'mock-v1'
    };
  }

  /**
   * Simulates AWS S3 GetObjectCommand
   */
  async getObject(key) {
    if (!this.storage.has(key)) {
      throw new Error(`NoSuchKey: The specified key does not exist. (Key: ${key})`);
    }
    const item = this.storage.get(key);
    return {
      bucket: this.bucketName,
      key,
      body: item.body,
      metadata: item.metadata,
      lastModified: item.lastModified
    };
  }

  /**
   * Simulates AWS S3 ListObjectsV2Command
   */
  async listObjects(prefix = '') {
    const keys = Array.from(this.storage.keys()).filter(k => k.startsWith(prefix));
    return {
      bucket: this.bucketName,
      keyCount: keys.length,
      contents: keys.map(k => ({
        key: k,
        lastModified: this.storage.get(k).lastModified
      }))
    };
  }
}

class MockDynamoDBService {
  constructor(tableName = 'AirbusFlightAcceptanceAudits') {
    this.tableName = tableName;
    this.records = new Map(); // Key: PK + '#' + SK
  }

  /**
   * Simulates AWS DynamoDB PutItemCommand
   * @param {object} item - Attributes including PK and SK
   */
  async putItem(item) {
    const pk = item.PK || `AIRCRAFT#${item.icao || 'UNKNOWN'}`;
    const sk = item.SK || `TIMESTAMP#${item.timestamp || new Date().toISOString()}`;
    const compositeKey = `${pk}#${sk}`;

    const record = {
      ...item,
      PK: pk,
      SK: sk,
      _persistedAt: new Date().toISOString()
    };

    this.records.set(compositeKey, record);
    return {
      consumedCapacity: { tableName: this.tableName, capacityUnits: 1.0 },
      record
    };
  }

  /**
   * Simulates AWS DynamoDB QueryCommand by Partition Key
   */
  async queryByAircraft(icao, limit = 20) {
    const targetPK = `AIRCRAFT#${icao.toUpperCase()}`;
    const results = [];

    for (const [key, val] of this.records.entries()) {
      if (val.PK === targetPK) {
        results.push(val);
      }
    }

    results.sort((a, b) => (b.SK > a.SK ? 1 : -1));
    return results.slice(0, limit);
  }

  /**
   * Get total count of persisted compliance events
   */
  async scanCount() {
    return this.records.size;
  }
}

// Export singleton instances
const s3Mock = new MockS3Service();
const dynamoMock = new MockDynamoDBService();

module.exports = {
  MockS3Service,
  MockDynamoDBService,
  s3Mock,
  dynamoMock
};
