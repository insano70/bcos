#!/usr/bin/env node
/**
 * Diagnose cache miss for a specific data source and measure
 * 
 * Usage: node scripts/diagnose-cache-miss.mjs <dataSourceId> [measure] [frequency]
 * Example: node scripts/diagnose-cache-miss.mjs 2 "Nextgen Denials" "Monthly"
 */

import Redis from 'ioredis';
import { readFileSync } from 'fs';

const dataSourceId = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const targetMeasure = process.argv[3] || null;
const targetFrequency = process.argv[4] || null;

if (!dataSourceId) {
  console.error('Usage: node scripts/diagnose-cache-miss.mjs <dataSourceId> [measure] [frequency]');
  process.exit(1);
}

// Load env
const envFile = readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2];
  }
});

const environment = env.ENVIRONMENT || 'development';
const keyPrefix = `bcos:${environment}:`;

const client = new Redis({
  host: env.REDIS_HOST,
  port: parseInt(env.REDIS_PORT, 10),
  username: env.REDIS_USERNAME,
  password: env.REDIS_PASSWORD,
  tls: env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: () => null,
});

async function main() {
  try {
    await new Promise((resolve, reject) => {
      client.once('ready', resolve);
      client.once('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    console.log(`\n🔍 CACHE DIAGNOSTIC REPORT - Data Source ${dataSourceId}\n`);
    console.log(`Key prefix: ${keyPrefix}`);
    console.log('='.repeat(60));

    // 1. Check metadata (warm status)
    const metadataKey = `${keyPrefix}cache:meta:{ds:${dataSourceId}}:last_warm`;
    const metadata = await client.get(metadataKey);
    
    if (metadata) {
      const parsed = JSON.parse(metadata);
      const data = Array.isArray(parsed) ? parsed[0] : parsed;
      console.log('\n✅ METADATA (Cache Warm Status):');
      console.log(`   Last Warmed: ${data.timestamp || 'N/A'}`);
      console.log(`   Unique Measures: ${data.uniqueMeasures || 'N/A'}`);
      console.log(`   Unique Practices: ${data.uniquePractices || 'N/A'}`);
      console.log(`   Unique Frequencies: ${JSON.stringify(data.uniqueFrequencies) || 'N/A'}`);
      console.log(`   Total Entries: ${data.totalEntries || 'N/A'}`);
    } else {
      console.log('\n❌ METADATA: Not found (cache not warmed)');
    }

    // 2. Find all index keys for this datasource
    console.log('\n📊 INDEX KEYS:');
    const indexPattern = `${keyPrefix}idx:{ds:${dataSourceId}}:*`;
    const indexKeys = [];
    let cursor = '0';
    
    do {
      const result = await client.scan(cursor, 'MATCH', indexPattern, 'COUNT', 1000);
      cursor = result[0];
      indexKeys.push(...result[1]);
    } while (cursor !== '0');

    console.log(`   Found ${indexKeys.length} index keys`);

    // Group by measure and frequency
    const measures = new Set();
    const frequencies = new Set();
    const measureFreqCombos = new Map();

    for (const key of indexKeys) {
      // Parse: idx:{ds:X}:m:MEASURE:freq:FREQUENCY or idx:{ds:X}:m:MEASURE:p:PRACTICE:freq:FREQUENCY
      const measureMatch = key.match(/:m:([^:]+):/);
      const freqMatch = key.match(/:freq:([^:]+)$/);
      
      if (measureMatch) {
        const measure = measureMatch[1];
        measures.add(measure);
        
        if (freqMatch) {
          const freq = freqMatch[1];
          frequencies.add(freq);
          
          const combo = `${measure}|${freq}`;
          if (!measureFreqCombos.has(combo)) {
            measureFreqCombos.set(combo, 0);
          }
          // Count entries in this index
          const count = await client.scard(key);
          measureFreqCombos.set(combo, measureFreqCombos.get(combo) + count);
        }
      }
    }

    console.log(`\n📈 UNIQUE MEASURES (${measures.size}):`);
    for (const m of Array.from(measures).sort()) {
      const marker = targetMeasure && m === targetMeasure ? ' ← TARGET' : '';
      const caseIssue = targetMeasure && m.toLowerCase() === targetMeasure.toLowerCase() && m !== targetMeasure ? ' ⚠️ CASE MISMATCH' : '';
      console.log(`   - "${m}"${marker}${caseIssue}`);
    }

    console.log(`\n📅 UNIQUE FREQUENCIES (${frequencies.size}):`);
    for (const f of Array.from(frequencies).sort()) {
      const marker = targetFrequency && f === targetFrequency ? ' ← TARGET' : '';
      const caseIssue = targetFrequency && f.toLowerCase() === targetFrequency.toLowerCase() && f !== targetFrequency ? ' ⚠️ CASE MISMATCH' : '';
      console.log(`   - "${f}"${marker}${caseIssue}`);
    }

    // 3. Check specific target if provided
    if (targetMeasure) {
      console.log('\n🎯 TARGET MEASURE ANALYSIS:');
      
      const exactMatch = measures.has(targetMeasure);
      const caseInsensitiveMatch = Array.from(measures).find(m => m.toLowerCase() === targetMeasure.toLowerCase());
      
      if (exactMatch) {
        console.log(`   ✅ Exact match found: "${targetMeasure}"`);
      } else if (caseInsensitiveMatch) {
        console.log(`   ⚠️ Case mismatch! Found "${caseInsensitiveMatch}" but looking for "${targetMeasure}"`);
        console.log(`   💡 FIX: Normalize case in cache keys`);
      } else {
        console.log(`   ❌ Measure NOT FOUND in cache: "${targetMeasure}"`);
        console.log(`   💡 This explains the cache miss - measure doesn't exist in cached data`);
      }

      if (targetFrequency) {
        const freqExact = frequencies.has(targetFrequency);
        const freqCaseMatch = Array.from(frequencies).find(f => f.toLowerCase() === targetFrequency.toLowerCase());
        
        if (freqExact) {
          console.log(`   ✅ Frequency exact match: "${targetFrequency}"`);
        } else if (freqCaseMatch) {
          console.log(`   ⚠️ Frequency case mismatch! Found "${freqCaseMatch}" but looking for "${targetFrequency}"`);
        } else {
          console.log(`   ❌ Frequency NOT FOUND: "${targetFrequency}"`);
        }

        // Check combo
        const targetCombo = `${targetMeasure}|${targetFrequency}`;
        const comboExists = measureFreqCombos.has(targetCombo);
        
        if (comboExists) {
          console.log(`   ✅ Measure+Frequency combo exists with ${measureFreqCombos.get(targetCombo)} cache entries`);
        } else {
          console.log(`   ❌ Measure+Frequency combo NOT in cache`);
          
          // Find similar combos
          const similar = Array.from(measureFreqCombos.keys()).filter(k => 
            k.toLowerCase().includes(targetMeasure.toLowerCase().substring(0, 10))
          );
          if (similar.length > 0) {
            console.log(`   📋 Similar combos found:`);
            for (const s of similar.slice(0, 5)) {
              console.log(`      - ${s}`);
            }
          }
        }
      }
    }

    // 4. Sample cache keys
    console.log('\n📦 SAMPLE CACHE KEYS:');
    const cachePattern = `${keyPrefix}cache:{ds:${dataSourceId}}:*`;
    const cacheKeys = [];
    cursor = '0';
    
    do {
      const result = await client.scan(cursor, 'MATCH', cachePattern, 'COUNT', 100);
      cursor = result[0];
      cacheKeys.push(...result[1]);
      if (cacheKeys.length >= 10) break;
    } while (cursor !== '0');

    if (cacheKeys.length > 0) {
      console.log(`   Found ${cacheKeys.length}+ cache keys. Samples:`);
      for (const key of cacheKeys.slice(0, 5)) {
        const shortKey = key.replace(keyPrefix, '');
        console.log(`   - ${shortKey}`);
      }
    } else {
      console.log('   ❌ No cache keys found!');
    }

    console.log('\n' + '='.repeat(60));
    console.log('DIAGNOSIS COMPLETE\n');

    client.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    client.disconnect();
    process.exit(1);
  }
}

main();


