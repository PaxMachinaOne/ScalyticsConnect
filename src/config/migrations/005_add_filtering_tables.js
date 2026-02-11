// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { db } = require('../../models/db');

const MIGRATION_NAME = '005_add_filtering_tables';

exports.up = async () => {
  // Use PRAGMA foreign_keys=off/on for potentially safer ALTER/CREATE with FKs in SQLite
  await db.execAsync('PRAGMA foreign_keys=off;');
  await db.execAsync('BEGIN TRANSACTION;');

  try {
    await db.execAsync(`
      -- Create filter_groups table
      CREATE TABLE IF NOT EXISTS filter_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        is_enabled INTEGER DEFAULT 1 NOT NULL, -- 1 = This filter group's rules are active, 0 = Inactive
        exemption_permission_key TEXT DEFAULT NULL, -- Key from 'permissions' table needed to bypass this group
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        -- Cannot add FK during CREATE IF NOT EXISTS reliably with older SQLite, add later if needed or handle in app logic
        -- FOREIGN KEY (exemption_permission_key) REFERENCES permissions(key) ON DELETE SET NULL ON UPDATE CASCADE
      );
    `);

    await db.execAsync(`
      -- Create filter_rules table
      CREATE TABLE IF NOT EXISTS filter_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filter_group_id INTEGER NOT NULL,
        rule_type TEXT NOT NULL, -- Allow various types: 'regex', 'ner_person', 'presidio_phone_number', etc.
        pattern TEXT NOT NULL, -- Regex pattern, NER entity type, Presidio entity type, etc.
        description TEXT,
        replacement TEXT, -- Optional placeholder for replacement, e.g., "[CREDIT_CARD]", "[PERSON]"
        is_active INTEGER DEFAULT 1 NOT NULL, -- 0 = Inactive, 1 = Active
        is_system_default INTEGER DEFAULT 0 NOT NULL, -- 1 = System default rule (read-only except active status)
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (filter_group_id) REFERENCES filter_groups(id) ON DELETE CASCADE,
        UNIQUE(filter_group_id, rule_type, pattern) -- Added UNIQUE constraint
      );
    `);

    // Add is_system_default column if it doesn't exist (for upgrades)
    try {
        await db.execAsync(`ALTER TABLE filter_rules ADD COLUMN is_system_default INTEGER DEFAULT 0 NOT NULL;`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) { 
             console.warn(`Could not add is_system_default column (may already exist): ${e.message}`);
        }
    }

    try {
        await db.execAsync(`ALTER TABLE filter_groups ADD COLUMN exemption_permission_key TEXT DEFAULT NULL;`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) { 
             console.warn(`Could not add exemption_permission_key column (may already exist): ${e.message}`);
        }
    }


    await db.execAsync(`
      -- Create updated_at triggers
      CREATE TRIGGER IF NOT EXISTS trigger_filter_groups_updated_at
      AFTER UPDATE ON filter_groups FOR EACH ROW
      BEGIN
        UPDATE filter_groups SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trigger_filter_rules_updated_at
      AFTER UPDATE ON filter_rules FOR EACH ROW
      BEGIN
        UPDATE filter_rules SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `);

    // Add indexes
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_filter_rules_group_id ON filter_rules(filter_group_id);`);
    await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_filter_rules_is_active ON filter_rules(is_active);`);

    // Insert standard filter-related permissions
    await db.runAsync(`
      INSERT OR IGNORE INTO permissions (key, name, description, source) VALUES
        ('filter:bypass_finance', 'Bypass Finance Filters', 'Allows viewing unfiltered financial data (e.g., credit cards).', 'filtering'),
        ('filter:bypass_health', 'Bypass Health Filters', 'Allows viewing unfiltered health data (e.g., patient IDs).', 'filtering'),
        ('filter:bypass_private', 'Bypass Private Filters', 'Allows viewing unfiltered private data (e.g., names, addresses).', 'filtering'),
        ('filter:bypass_credentials', 'Bypass Credentials Filters', 'Allows viewing unfiltered credentials (e.g., API keys, passwords).', 'filtering')
    `);

    // Insert default filter groups linked to permissions
    await db.runAsync(`
      INSERT OR IGNORE INTO filter_groups (name, description, is_enabled, exemption_permission_key) VALUES
        ('Finance', 'Filters related to financial data (PCI DSS)', 1, 'filter:bypass_finance'),
        ('Healthcare', 'Filters related to health data (HIPAA)', 1, 'filter:bypass_health'),
        ('Private', 'Filters related to general private data (GDPR PII)', 1, 'filter:bypass_private'),
        ('Credentials', 'Filters related to secrets and credentials', 1, 'filter:bypass_credentials')
    `);

    // Insert default system setting for active filter languages
    await db.runAsync(`
      INSERT OR IGNORE INTO system_settings (key, value)
      VALUES ('active_filter_languages', '["en"]')
    `);

    // Insert default system filter rules (Regex examples from User Notes)
    await db.runAsync(`
      -- Finance Group
      INSERT OR IGNORE INTO filter_rules (filter_group_id, rule_type, pattern, description, replacement, is_active, is_system_default) VALUES
        ((SELECT id FROM filter_groups WHERE name = 'Finance'), 'regex', '(?<![:/\\\\w]|:\\/\\/)4\\\\d{3}(?:[\\\\s-]?\\\\d{4}){3}(?![\\\\/\\\\w])', 'Credit Card (Visa)', '[CREDIT_CARD_VISA]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Finance'), 'regex', '(?<![:/\\\\w]|:\\/\\/)5[1-5]\\\\d{2}(?:[\\\\s-]?\\\\d{4}){3}(?![\\\\/\\\\w])', 'Credit Card (MasterCard)', '[CREDIT_CARD_MC]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Finance'), 'regex', '(?<![:/\\\\w]|:\\/\\/)3[47]\\\\d{2}[\\\\s-]?\\\\d{6}[\\\\s-]?\\\\d{5}(?![\\\\/\\\\w])', 'Credit Card (Amex)', '[CREDIT_CARD_AMEX]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Finance'), 'regex', '(?<![:/\\\\w]|:\\/\\/)6(?:011|5\\\\d{2})(?:[\\\\s-]?\\\\d{4}){3}(?![\\\\/\\\\w])', 'Credit Card (Discover)', '[CREDIT_CARD_DISC]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Finance'), 'regex', '(?<![A-Z0-9])(?:AL\\\\d{10}[0-9A-Z]{16}|AD\\\\d{10}[0-9A-Z]{12}|AT\\\\d{18}|AZ\\\\d{2}[A-Z]{4}[0-9A-Z]{20}|BH\\\\d{2}[A-Z]{4}[0-9A-Z]{14}|BE\\\\d{14}|BA\\\\d{18}|BR\\\\d{2}\\\\d{23}[A-Z]{1}[0-9A-Z]{1}|BG\\\\d{2}[A-Z]{4}\\\\d{6}[A-Z0-9]{8}|CR\\\\d{20}|HR\\\\d{19}|CY\\\\d{10}[0-9A-Z]{16}|CZ\\\\d{22}|DK\\\\d{16}|DO\\\\d{2}[A-Z]{4}\\\\d{20}|EE\\\\d{18}|FO\\\\d{16}|FI\\\\d{16}|FR\\\\d{12}[0-9A-Z]{11}\\\\d{2}|GE\\\\d{2}[A-Z]{2}\\\\d{16}|DE\\\\d{20}|GI\\\\d{2}[A-Z]{4}[0-9A-Z]{15}|GR\\\\d{9}[0-9A-Z]{16}|GL\\\\d{16}|GT\\\\d{2}[A-Z0-9]{4}[0-9A-Z]{20}|HU\\\\d{26}|IS\\\\d{24}|IE\\\\d{2}[A-Z]{4}\\\\d{14}|IL\\\\d{21}|IT\\\\d{2}[A-Z]\\\\d{10}[0-9A-Z]{12}|JO\\\\d{2}[A-Z]{4}\\\\d{4}[0-9A-Z]{18}|KZ\\\\d{5}[0-9A-Z]{13}|KW\\\\d{2}[A-Z]{4}[0-9A-Z]{22}|LV\\\\d{2}[A-Z]{4}[0-9A-Z]{13}|LB\\\\d{6}[0-9A-Z]{20}|LI\\\\d{7}[0-9A-Z]{12}|LT\\\\d{18}|LU\\\\d{5}[0-9A-Z]{13}|MK\\\\d{5}[0-9A-Z]{10}\\\\d{2}|MT\\\\d{2}[A-Z]{4}\\\\d{5}[0-9A-Z]{18}|MR\\\\d{25}|MU\\\\d{2}[A-Z]{4}\\\\d{19}[A-Z]{3}|MD\\\\d{2}[A-Z0-9]{20}|MC\\\\d{12}[0-9A-Z]{11}\\\\d{2}|ME\\\\d{20}|NL\\\\d{2}[A-Z]{4}\\\\d{10}|NO\\\\d{13}|PK\\\\d{2}[A-Z]{4}[0-9A-Z]{16}|PS\\\\d{2}[A-Z]{4}[0-9A-Z]{21}|PL\\\\d{26}|PT\\\\d{23}|QA\\\\d{2}[A-Z]{4}[0-9A-Z]{21}|RO\\\\d{2}[A-Z]{4}[0-9A-Z]{16}|SM\\\\d{2}[A-Z]\\\\d{10}[0-9A-Z]{12}|SA\\\\d{4}[0-9A-Z]{18}|RS\\\\d{20}|SK\\\\d{22}|SI\\\\d{17}|ES\\\\d{22}|SE\\\\d{22}|CH\\\\d{7}[0-9A-Z]{12}|TN\\\\d{22}|TR\\\\d{8}[0-9A-Z]{16}|AE\\\\d{21}|GB\\\\d{2}[A-Z]{4}\\\\d{14}|VG\\\\d{2}[A-Z]{4}\\\\d{16})(?![A-Z0-9])', 'IBAN (all countries)', '[IBAN]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Finance'), 'regex', '(?<![A-Z0-9])[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?![A-Z0-9])', 'BIC Code (8 chars)', '[BIC]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Finance'), 'regex', '(?<![A-Z0-9])[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}[A-Z0-9]{3}(?![A-Z0-9])', 'SWIFT Code (11 chars)', '[SWIFT]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Finance'), 'regex', '\\b\\d{9}\\b', 'US Routing Number (9 digits)', '[ROUTING_NUMBER]', 1, 1);
    `);

    await db.runAsync(`
      -- Private Group
      INSERT OR IGNORE INTO filter_rules (filter_group_id, rule_type, pattern, description, replacement, is_active, is_system_default) VALUES
        ((SELECT id FROM filter_groups WHERE name = 'Private'), 'regex', '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b', 'Email Address', '[EMAIL_ADDRESS]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Private'), 'regex', '\\b(?:(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d{2}|[1-9]?\\d)\\b', 'IPv4 Address', '[IP_ADDRESS]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Private'), 'regex', '\\b(?:\\+1\\s?)?(?:\\(?\\d{3}\\)?[\\s.-]?)?\\d{3}[\\s.-]?\\d{4}\\b', 'US Phone Number', '[PHONE_NUMBER_US]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Private'), 'regex', '\\b(?:\\+49\\s?|0)(?:\\d{2,5}[\\s/-]?\\d{3,})(?:[\\s/-]?\\d+)?\\b', 'German Phone Number', '[PHONE_NUMBER_DE]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Private'), 'regex', '\\b(?:\\+33\\s?|0)[1-9](?:[\\s.-]?\\d{2}){4}\\b', 'French Phone Number', '[PHONE_NUMBER_FR]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Private'), 'regex', '\\b(?:\\+34\\s?)?[6789]\\d{2}(?:[\\s-]?\\d{2}){3}\\b', 'Spanish Phone Number', '[PHONE_NUMBER_ES]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Private'), 'regex', '\\b(?:\\+55\\s?)?(?:\\(?\\d{2}\\)?[\\s-]?)?(?:9\\d{4}|\\d{4})[\\s-]?\\d{4}\\b', 'Brazilian Phone Number', '[PHONE_NUMBER_BR]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Private'), 'regex', '\\b(?:\\+351\\s?)?[29]\\d{2}[\\s-]?\\d{3}[\\s-]?\\d{3}\\b', 'Portuguese Phone Number', '[PHONE_NUMBER_PT]', 1, 1);
    `);

    await db.runAsync(`
      -- Credentials Group
      INSERT OR IGNORE INTO filter_rules (filter_group_id, rule_type, pattern, description, replacement, is_active, is_system_default) VALUES
        ((SELECT id FROM filter_groups WHERE name = 'Credentials'), 'regex', '\\b[A-Za-z0-9-_]{20,}\\.[A-Za-z0-9-_]{20,}\\.[A-Za-z0-9-_]{20,}\\b', 'JWT-like Token', '[TOKEN]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Credentials'), 'regex', '\\b[a-f0-9]{64}\\b', 'SHA-256 Hash / API Key', '[KEY_HASH]', 1, 1),
        ((SELECT id FROM filter_groups WHERE name = 'Credentials'), 'regex', '\\b[A-Za-z0-9+/]{40,}={0,2}\\b', 'Base64 Token (Long)', '[BASE64_TOKEN]', 1, 1);
    `);

    await db.execAsync('COMMIT;');

  } catch (error) {
      await db.execAsync('ROLLBACK;').catch(rbErr => console.error('Rollback failed during migration error:', rbErr));
      console.error(`Migration ${MIGRATION_NAME} failed:`, error);
      throw error; 
  } finally {
      await db.execAsync('PRAGMA foreign_keys=on;');
  }
};

exports.down = async () => {
  console.warn(`\nReverting migration ${MIGRATION_NAME} is not automatically supported.`);
  console.warn(`Manually remove filter_groups, filter_rules tables, related permissions, and system settings if needed.`);
  
  
};

if (require.main === module) {
  const direction = process.argv[2]; 
  if (direction === 'up') {
    exports.up().catch(err => {
      console.error("Manual migration failed:", err);
      process.exit(1);
    });
  } else if (direction === 'down') {
    exports.down().catch(err => {
      console.error("Manual reversion failed:", err);
      process.exit(1);
    });
  } else {
    
    process.exit(0);
  }
}
