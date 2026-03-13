const { getPfSenseClient } = require('./pfsense');

/**
 * List all DNS host override entries
 */
async function listEntries(filter = null) {
  const client = getPfSenseClient();
  
  try {
    const response = await client.get('/api/v2/services/dns_resolver/host_overrides');
    const entries = response.data.data || [];
    
    let filteredEntries = entries;
    if (filter) {
      filteredEntries = entries.filter(entry => 
        entry.host.toLowerCase().includes(filter.toLowerCase()) ||
        entry.domain.toLowerCase().includes(filter.toLowerCase())
      );
    }
    
    if (filteredEntries.length === 0) {
      console.log('No entries found.');
      return;
    }
    
    console.log('\nDNS Host Override Entries:');
    console.log('═'.repeat(80));
    
    filteredEntries.forEach((entry, index) => {
      console.log(`\n${index + 1}. ${entry.host}.${entry.domain}`);
      console.log(`   IP: ${entry.ip}`);
      if (entry.descr) {
        console.log(`   Description: ${entry.descr}`);
      }
      if (entry.aliases && entry.aliases.length > 0) {
        console.log(`   Aliases: ${entry.aliases.map(a => `${a.host}.${a.domain}`).join(', ')}`);
      }
    });
    
    console.log('\n' + '═'.repeat(80));
    console.log(`Total: ${filteredEntries.length} entries\n`);
    
  } catch (error) {
    throw new Error(`Failed to list entries: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Add a new DNS host override entry
 */
async function addEntry({ host, domain, ip, description }) {
  const client = getPfSenseClient();
  
  try {
    const payload = {
      host,
      domain,
      ip: Array.isArray(ip) ? ip : [ip],
      descr: description || '',
      aliases: []
    };
    
    const response = await client.post('/api/v2/services/dns_resolver/host_override', payload);
    
    if (response.data.code === 200) {
      console.log(`✓ Successfully added DNS entry: ${host}.${domain} -> ${ip}`);
      
      // Apply changes
      await applyChanges(client);
    } else {
      throw new Error(response.data.message || 'Failed to add entry');
    }
    
  } catch (error) {
    throw new Error(`Failed to add entry: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Update an existing DNS host override entry
 */
async function updateEntry({ host, domain, ip, description }) {
  const client = getPfSenseClient();
  
  try {
    // First, get the current entry
    const listResponse = await client.get('/api/v2/services/dns_resolver/host_overrides');
    const entries = listResponse.data.data || [];
    
    const entryIndex = entries.findIndex(e => e.host === host && e.domain === domain);
    
    if (entryIndex === -1) {
      throw new Error(`Entry not found: ${host}.${domain}`);
    }
    
    const currentEntry = entries[entryIndex];
    
    // Build update payload
    const payload = {
      id: entryIndex,
      host,
      domain,
      ip: ip ? (Array.isArray(ip) ? ip : [ip]) : currentEntry.ip,
      descr: description !== undefined ? description : currentEntry.descr,
      aliases: currentEntry.aliases || []
    };
    
    const response = await client.patch('/api/v2/services/dns_resolver/host_override', payload);
    
    if (response.data.code === 200) {
      console.log(`✓ Successfully updated DNS entry: ${host}.${domain}`);
      
      // Apply changes
      await applyChanges(client);
    } else {
      throw new Error(response.data.message || 'Failed to update entry');
    }
    
  } catch (error) {
    throw new Error(`Failed to update entry: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete a DNS host override entry
 */
async function deleteEntry(host, domain) {
  const client = getPfSenseClient();
  
  try {
    // First, get the current entries to find the ID
    const listResponse = await client.get('/api/v2/services/dns_resolver/host_overrides');
    const entries = listResponse.data.data || [];
    
    const entryIndex = entries.findIndex(e => e.host === host && e.domain === domain);
    
    if (entryIndex === -1) {
      throw new Error(`Entry not found: ${host}.${domain}`);
    }
    
    const response = await client.delete('/api/v2/services/dns_resolver/host_override', {
      data: { id: entryIndex }
    });
    
    if (response.data.code === 200) {
      console.log(`✓ Successfully deleted DNS entry: ${host}.${domain}`);
      
      // Apply changes
      await applyChanges(client);
    } else {
      throw new Error(response.data.message || 'Failed to delete entry');
    }
    
  } catch (error) {
    throw new Error(`Failed to delete entry: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Apply DNS Resolver configuration changes
 */
async function applyChanges(client) {
  try {
    await client.post('/api/v2/services/dns_resolver/apply');
    console.log('✓ DNS Resolver configuration applied');
  } catch (error) {
    console.warn('Warning: Changes saved but failed to apply automatically. You may need to apply manually.');
  }
}

/**
 * Add an alias to an existing DNS host override entry
 */
async function addAlias({ host, domain, aliasHost, aliasDomain, description }) {
  const client = getPfSenseClient();
  
  try {
    // First, get the current entry
    const listResponse = await client.get('/api/v2/services/dns_resolver/host_overrides');
    const entries = listResponse.data.data || [];
    
    const entryIndex = entries.findIndex(e => e.host === host && e.domain === domain);
    
    if (entryIndex === -1) {
      throw new Error(`Parent entry not found: ${host}.${domain}`);
    }
    
    const currentEntry = entries[entryIndex];
    const currentAliases = currentEntry.aliases || [];
    
    // Check if alias already exists
    const aliasExists = currentAliases.some(
      a => a.host === aliasHost && a.domain === aliasDomain
    );
    
    if (aliasExists) {
      console.log(`ℹ Alias already exists: ${aliasHost}.${aliasDomain} -> ${host}.${domain}`);
      return;
    }
    
    // Add new alias
    const newAlias = {
      host: aliasHost,
      domain: aliasDomain,
      descr: description || ''
    };
    
    const updatedAliases = [...currentAliases, newAlias];
    
    // Update the entry
    const payload = {
      id: entryIndex,
      host: currentEntry.host,
      domain: currentEntry.domain,
      ip: currentEntry.ip,
      descr: currentEntry.descr || '',
      aliases: updatedAliases
    };
    
    const response = await client.patch('/api/v2/services/dns_resolver/host_override', payload);
    
    if (response.data.code === 200) {
      console.log(`✓ Successfully added alias: ${aliasHost}.${aliasDomain} -> ${host}.${domain} (${currentEntry.ip})`);
      
      // Apply changes
      await applyChanges(client);
    } else {
      throw new Error(response.data.message || 'Failed to add alias');
    }
    
  } catch (error) {
    throw new Error(`Failed to add alias: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete an alias from a DNS host override entry
 */
async function deleteAlias({ host, domain, aliasHost, aliasDomain }) {
  const client = getPfSenseClient();
  
  try {
    // First, get the current entry
    const listResponse = await client.get('/api/v2/services/dns_resolver/host_overrides');
    const entries = listResponse.data.data || [];
    
    const entryIndex = entries.findIndex(e => e.host === host && e.domain === domain);
    
    if (entryIndex === -1) {
      throw new Error(`Parent entry not found: ${host}.${domain}`);
    }
    
    const currentEntry = entries[entryIndex];
    const currentAliases = currentEntry.aliases || [];
    
    // Find and remove the alias
    const aliasIndex = currentAliases.findIndex(
      a => a.host === aliasHost && a.domain === aliasDomain
    );
    
    if (aliasIndex === -1) {
      throw new Error(`Alias not found: ${aliasHost}.${aliasDomain}`);
    }
    
    const updatedAliases = currentAliases.filter((_, index) => index !== aliasIndex);
    
    // Update the entry
    const payload = {
      id: entryIndex,
      host: currentEntry.host,
      domain: currentEntry.domain,
      ip: currentEntry.ip,
      descr: currentEntry.descr || '',
      aliases: updatedAliases
    };
    
    const response = await client.patch('/api/v2/services/dns_resolver/host_override', payload);
    
    if (response.data.code === 200) {
      console.log(`✓ Successfully deleted alias: ${aliasHost}.${aliasDomain}`);
      
      // Apply changes
      await applyChanges(client);
    } else {
      throw new Error(response.data.message || 'Failed to delete alias');
    }
    
  } catch (error) {
    throw new Error(`Failed to delete alias: ${error.response?.data?.message || error.message}`);
  }
}

module.exports = {
  listEntries,
  addEntry,
  updateEntry,
  deleteEntry,
  addAlias,
  deleteAlias
};
