const { getPfSenseClient } = require('./pfsense');

/**
 * List HAProxy backends
 */
async function listBackends({ filter } = {}) {
  const client = getPfSenseClient();
  
  try {
    const response = await client.get('/api/v2/services/haproxy/backends');
    
    if (response.data.code !== 200) {
      throw new Error(response.data.message || 'Failed to list backends');
    }
    
    let backends = response.data.data || [];
    
    // Apply filter if provided
    if (filter) {
      backends = backends.filter(backend => 
        backend.name.toLowerCase().includes(filter.toLowerCase())
      );
    }
    
    console.log('\nHAProxy Backend Entries:');
    console.log('═'.repeat(80));
    console.log('');
    
    backends.forEach((backend, index) => {
      console.log(`${index + 1}. ${backend.name}`);
      console.log(`   Balance: ${backend.balance || 'none'}`);
      console.log(`   Check Type: ${backend.check_type || 'none'}`);
      
      if (backend.servers && backend.servers.length > 0) {
        console.log(`   Servers:`);
        backend.servers.forEach(server => {
          const ssl = server.ssl ? ' [SSL]' : '';
          console.log(`     - ${server.name} (${server.address}:${server.port})${ssl} [${server.status}]`);
        });
      } else {
        console.log(`   Servers: none`);
      }
      console.log('');
    });
    
    console.log('═'.repeat(80));
    console.log(`Total: ${backends.length} backends\n`);
    
  } catch (error) {
    throw new Error(`Failed to list backends: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Add a HAProxy backend with a single server
 */
async function addBackend({ name, serverName, serverAddress, serverPort, checkType = 'Basic', balance = 'roundrobin', ssl = false }) {
  const client = getPfSenseClient();
  
  try {
    // Check if backend already exists
    const listResponse = await client.get('/api/v2/services/haproxy/backends');
    const backends = listResponse.data.data || [];
    const existingBackend = backends.find(b => b.name === name);
    
    if (existingBackend) {
      console.log(`ℹ Backend already exists: ${name}`);
      
      // Check if server already exists in the backend
      const existingServer = existingBackend.servers?.find(s => 
        s.name === serverName && s.address === serverAddress && s.port === serverPort.toString()
      );
      
      if (existingServer) {
        console.log(`ℹ Server already exists in backend: ${serverName} (${serverAddress}:${serverPort})`);
        return;
      }
      
      // Server doesn't exist, add it to existing backend
      const serverPayload = {
        parent_id: existingBackend.id,
        name: serverName,
        address: serverAddress,
        port: serverPort.toString(),
        status: 'active',
        ssl: ssl,
        sslserververify: false,
        weight: 1
      };
      
      const serverResponse = await client.post('/api/v2/services/haproxy/backend/server', serverPayload);
      
      if (serverResponse.data.code !== 200) {
        throw new Error(serverResponse.data.message || 'Failed to add server to backend');
      }
      
      console.log(`✓ Added server to existing backend: ${serverName} (${serverAddress}:${serverPort})`);
      await applyChanges(client);
      return;
    }
    
    // Create the backend (it doesn't exist)
    const backendPayload = {
      name,
      balance,
      check_type: checkType,
      servers: []
    };
    
    const backendResponse = await client.post('/api/v2/services/haproxy/backend', backendPayload);
    
    if (backendResponse.data.code !== 200) {
      throw new Error(backendResponse.data.message || 'Failed to create backend');
    }
    
    // Get the backend ID from the response
    const backendId = backendResponse.data.data.id;
    
    // Now add the server to the backend
    const serverPayload = {
      parent_id: backendId,
      name: serverName,
      address: serverAddress,
      port: serverPort.toString(),
      status: 'active',
      ssl: ssl,
      sslserververify: false,
      weight: 1
    };
    
    const serverResponse = await client.post('/api/v2/services/haproxy/backend/server', serverPayload);
    
    if (serverResponse.data.code !== 200) {
      throw new Error(serverResponse.data.message || 'Failed to add server to backend');
    }
    
    console.log(`✓ Successfully created HAProxy backend: ${name}`);
    console.log(`✓ Added server: ${serverName} (${serverAddress}:${serverPort})`);
    
    // Apply changes
    await applyChanges(client);
    
  } catch (error) {
    throw new Error(`Failed to add backend: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete a HAProxy backend
 */
async function deleteBackend(name) {
  const client = getPfSenseClient();
  
  try {
    // First, get the backend ID
    const listResponse = await client.get('/api/v2/services/haproxy/backends');
    const backends = listResponse.data.data || [];
    
    const backendIndex = backends.findIndex(b => b.name === name);
    
    if (backendIndex === -1) {
      throw new Error(`Backend not found: ${name}`);
    }
    
    const response = await client.delete('/api/v2/services/haproxy/backend', {
      data: { id: backendIndex }
    });
    
    if (response.data.code === 200) {
      console.log(`✓ Successfully deleted HAProxy backend: ${name}`);
      
      // Apply changes
      await applyChanges(client);
    } else {
      throw new Error(response.data.message || 'Failed to delete backend');
    }
    
  } catch (error) {
    throw new Error(`Failed to delete backend: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Add frontend ACL and action to route to a backend
 */
async function addFrontendRoute({ frontendName, aclName, hostname, backendName }) {
  const client = getPfSenseClient();
  
  try {
    // Get frontend ID
    const frontendsResponse = await client.get('/api/v2/services/haproxy/frontends');
    const frontends = frontendsResponse.data.data || [];
    
    const frontend = frontends.find(f => f.name === frontendName);
    if (!frontend) {
      throw new Error(`Frontend not found: ${frontendName}`);
    }
    
    const frontendId = frontend.id;
    
    // Check if ACL already exists
    const existingAcl = frontend.ha_acls?.find(a => a.name === aclName);
    
    if (!existingAcl) {
      // Add ACL
      const aclPayload = {
        parent_id: frontendId,
        name: aclName,
        expression: 'host_matches',
        value: hostname,
        casesensitive: false,
        not: false
      };
      
      const aclResponse = await client.post('/api/v2/services/haproxy/frontend/acl', aclPayload);
      
      if (aclResponse.data.code !== 200) {
        throw new Error(aclResponse.data.message || 'Failed to add ACL');
      }
      console.log(`✓ Created ACL: ${aclName}`);
    } else {
      console.log(`ℹ ACL already exists: ${aclName}`);
    }
    
    // Check if action already exists
    const existingAction = frontend.a_actionitems?.find(a => a.acl === aclName && a.backend === backendName);
    
    if (!existingAction) {
      // Add action
      const actionPayload = {
        parent_id: frontendId,
        action: 'use_backend',
        acl: aclName,
        backend: backendName
      };
      
      const actionResponse = await client.post('/api/v2/services/haproxy/frontend/action', actionPayload);
      
      if (actionResponse.data.code !== 200) {
        throw new Error(actionResponse.data.message || 'Failed to add action');
      }
      console.log(`✓ Created action: ${hostname} → ${backendName}`);
    } else {
      console.log(`ℹ Action already exists: ${hostname} → ${backendName}`);
    }
    
    // Apply changes
    await applyChanges(client);
    
  } catch (error) {
    throw new Error(`Failed to add frontend route: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Delete frontend ACL and action
 */
async function deleteFrontendRoute({ frontendName, aclName }) {
  const client = getPfSenseClient();
  
  try {
    // Get frontend details
    const frontendsResponse = await client.get('/api/v2/services/haproxy/frontends');
    const frontends = frontendsResponse.data.data || [];
    
    const frontend = frontends.find(f => f.name === frontendName);
    if (!frontend) {
      throw new Error(`Frontend not found: ${frontendName}`);
    }
    
    const frontendId = frontend.id;
    
    // Find ACL ID
    const acl = frontend.ha_acls?.find(a => a.name === aclName);
    if (!acl) {
      throw new Error(`ACL not found: ${aclName}`);
    }
    
    // Find action ID
    const action = frontend.a_actionitems?.find(a => a.acl === aclName);
    
    // Delete action first (if exists)
    if (action) {
      await client.delete('/api/v2/services/haproxy/frontend/action', {
        data: { parent_id: frontendId, id: action.id }
      });
    }
    
    // Delete ACL
    await client.delete('/api/v2/services/haproxy/frontend/acl', {
      data: { parent_id: frontendId, id: acl.id }
    });
    
    console.log(`✓ Deleted frontend route for ACL: ${aclName}`);
    
    // Apply changes
    await applyChanges(client);
    
  } catch (error) {
    throw new Error(`Failed to delete frontend route: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Apply HAProxy configuration changes
 */
async function applyChanges(client) {
  try {
    await client.post('/api/v2/services/haproxy/apply');
    console.log('✓ HAProxy configuration applied');
  } catch (error) {
    console.warn('Warning: Changes saved but failed to apply automatically. You may need to apply manually.');
  }
}

module.exports = {
  listBackends,
  addBackend,
  deleteBackend,
  addFrontendRoute,
  deleteFrontendRoute
};
