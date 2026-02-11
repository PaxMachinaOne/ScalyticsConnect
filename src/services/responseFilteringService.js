// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../models/db');
const { filteringWorkerService } = require('./filteringWorkerService'); 

let filterCache = {
  groups: {}, 
  rules: [], 
  lastUpdated: 0,
  cacheDuration: 5 * 60 * 1000, 
};

/**
 * Loads or reloads filter groups and active regex rules from the database into the cache.
 */
async function loadFilters() {
  const now = Date.now();
  if (now - filterCache.lastUpdated < filterCache.cacheDuration && filterCache.rules.length > 0) {
    return;
  }

  try {
    const groups = await db.allAsync('SELECT id, name, is_enabled, exemption_permission_key FROM filter_groups');
    const rules = await db.allAsync(`
      SELECT id, filter_group_id, rule_type, pattern, replacement
      FROM filter_rules
      WHERE is_active = 1
    `);

    const newCache = {
      groups: {},
      rules: [],
      lastUpdated: now,
      cacheDuration: filterCache.cacheDuration,
    };

    groups.forEach(group => {
      newCache.groups[group.id] = group;
    });

    rules.forEach(rule => {
      const ruleData = { ...rule };
      newCache.rules.push(ruleData);
    });

    filterCache = newCache;

  } catch (error) {
    console.error('[FilterService] Error loading filters from database:', error);
  }
}

/**
 * Applies configured filters to a text string based on user group exemptions.
 * @param {string} text - The text content to filter.
 * @param {number} userId - The ID of the user making the request (or null for system/unauthenticated).
 * @returns {Promise<string>} The filtered text.
 */
async function applyFilters(text, userId) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  await loadFilters();

  if (filterCache.rules.length === 0) {
    return text; 
  }

  let userPermissions = new Set();
  if (userId) {
    try {
      const directPerms = await db.allAsync(`
        SELECT p.permission_key -- Corrected column name
        FROM admin_permissions p
        JOIN user_admin_permissions uap ON p.id = uap.permission_id
        WHERE uap.user_id = ?
      `, [userId]);
      directPerms.forEach(p => userPermissions.add(p.permission_key)); 

      const groupPerms = await db.allAsync(`
        SELECT p.permission_key -- Corrected column name
        FROM admin_permissions p
        JOIN group_admin_permissions gap ON p.id = gap.permission_id
        JOIN user_groups ug ON gap.group_id = ug.group_id
        WHERE ug.user_id = ?
      `, [userId]);
      groupPerms.forEach(p => userPermissions.add(p.permission_key)); 

    } catch (error) {
      console.error(`[FilterService] Error fetching permissions for user ${userId}:`, error);
      userPermissions = new Set();
    }
  }

  let filteredText = text;

  for (const rule of filterCache.rules) {
    const filterGroup = filterCache.groups[rule.filter_group_id];

    if (!filterGroup || filterGroup.is_enabled !== 1) {
      continue; 
    }

    const exemptionPermission = filterGroup.exemption_permission_key;
    const isExempt = exemptionPermission && userPermissions.has(exemptionPermission);

    if (!isExempt) {
      const replacementValue = rule.replacement !== null && rule.replacement !== undefined ? rule.replacement : '[REDACTED]'; 

      try {
        if (rule.rule_type === 'regex') {
          try {
            const singleEscapedPattern = rule.pattern.replace(/\\\\/g, '\\');
            const regex = new RegExp(singleEscapedPattern, 'gi');
            filteredText = filteredText.replace(regex, replacementValue);
          } catch (regexError) {
             console.error(`[FilterService] Error creating/applying regex for rule ID ${rule.id} (Pattern: ${rule.pattern}):`, regexError);
          }
        } else if (rule.rule_type.startsWith('ner_')) {
          // Dynamically import franc
          const { franc } = await import('franc');
          const sampleText = filteredText.length > 500 ? filteredText.substring(0, 500) : filteredText;
          const langCode = franc(sampleText, { minLength: 3, whitelist: ['eng', 'deu', 'fra', 'spa'] }); 
          let langShortCode = 'en'; 
          if (langCode === 'deu') langShortCode = 'de';
          else if (langCode === 'fra') langShortCode = 'fr';
          else if (langCode === 'spa') langShortCode = 'es';
          

          const entityType = rule.pattern; 
          const detectedEntities = await filteringWorkerService.detectEntities(filteredText, [entityType], langShortCode);

          // Replace detected entities (simple replacement for now)
          // Note: This is a basic replacement; more sophisticated masking might be needed
          // Also, overlapping entities could cause issues with simple replace.
          let offset = 0;
          detectedEntities.sort((a, b) => a.start_char - b.start_char); 
          for (const entity of detectedEntities) {
             const start = entity.start_char + offset;
             const end = entity.end_char + offset;
             const replacement = rule.replacement || `[${entity.label}]`; 
             filteredText = filteredText.substring(0, start) + replacement + filteredText.substring(end);
             offset += replacement.length - (end - start);
          }
        } else if (rule.rule_type.startsWith('presidio_')) {
           // Placeholder for Presidio integration (if added later)
           console.warn(`[FilterService] Presidio rule type (${rule.rule_type}) not yet implemented. Rule ID: ${rule.id}`);
           // const presidioEntityType = rule.pattern;
           // const results = await filteringWorkerService.analyzeWithPresidio(filteredText, [presidioEntityType]);
           // filteredText = filteringWorkerService.anonymizeWithPresidio(filteredText, results, replacementValue);
        } else {
           console.warn(`[FilterService] Unknown rule type "${rule.rule_type}" for rule ID ${rule.id}. Skipping.`);
        }
      } catch (e) {
         console.error(`[FilterService] Error applying rule ID ${rule.id} (Type: ${rule.rule_type}, Pattern: ${rule.pattern}):`, e);
      }
      // Removed logging based on textBeforeRule
    } else {
       // Optional: Log skipped rules (due to exemption)
    }
  }

  // Removed final debug log
  return filteredText;
}

module.exports = {
  applyFilters,
  loadFilters, 
};
