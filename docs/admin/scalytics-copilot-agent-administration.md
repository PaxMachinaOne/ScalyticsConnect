# Scalytics Copilot Agent Administration Guide

This guide is intended for system administrators responsible for configuring, managing, and monitoring the Scalytics Copilot Agent system.

## Overview

The Scalytics Copilot Agent system provides AI agent capabilities to your users through a WebSocket-based communication protocol. As an administrator, you'll be responsible for:

1. Configuring available agent types
2. Managing tool permissions
3. Monitoring agent usage
4. Troubleshooting issues

## System Requirements

The Scalytics Copilot Agent system relies on the following components:

- Node.js server with WebSocket support
- Database for agent state persistence
- Adequate RAM for concurrent agent sessions (min. 4GB recommended)
- Network configuration allowing WebSocket connections

## Agent Configuration

### Configuring Available Agents

Agents are defined in the `config/agents.json` file. Each agent has the following properties:

```json
{
  "id": "research-assistant",
  "name": "Research Assistant",
  "description": "Helps find and summarize information",
  "icon": "research_icon.svg",
  "model": "gpt-4-turbo",
  "systemPrompt": "You are a Research Assistant...",
  "tools": ["web_search", "document_analysis", "summarization"],
  "defaultPermissionLevel": 1
}
```

### Tool Configuration

Tools are configured in `config/tools.json`. Each tool requires:

```json
{
  "id": "web_search",
  "name": "Web Search",
  "description": "Search the web for information",
  "handlerPath": "./tools/web_search.js",
  "requiredPermissionLevel": 1,
  "rateLimits": {
    "perUser": 50,
    "perHour": 10
  }
}
```

### Permission Levels

The Scalytics Copilot Agent system uses the following permission levels:

| Level | Description | Approval Required | Example Tools |
|-------|-------------|-------------------|--------------|
| 0 | Basic tools | None | Dictionary, calculator |
| 1 | Standard tools | None | Web search, summarization |
| 2 | Advanced tools | User approval | File access, email drafting |
| 3 | Administrative tools | Admin approval | Database access, system configuration |
| 4 | Restricted tools | System approval | Payment processing, user data access |

To modify permission levels, edit the `config/permissions.json` file.

## Deployment

### Production Deployment Recommendations

For production environments:

1. Use a process manager like PM2
2. Set up load balancing for WebSocket connections
3. Configure session persistence
4. Implement proper logging
5. Set up monitoring

Example PM2 configuration:

```json
{
  "apps": [{
    "name": "scalytics-copilot-agent-server",
    "script": "server.js",
    "instances": "max",
    "exec_mode": "cluster",
    "env": {
      "NODE_ENV": "production",
      "PORT": 3000,
      "WEBSOCKET_PATH": "/ws",
      "SESSION_SECRET": "your-secure-session-secret",
      "DB_CONNECTION": "your-database-connection-string"
    }
  }]
}
```

### WebSocket Configuration

The WebSocket server requires specific configuration in your web server or proxy:

#### Caddy Configuration

```nginx
http {
  map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
  }

  server {
    listen 80;
    server_name example.com;

    location /ws {
      proxy_pass http://localhost:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_set_header Host $host;
      proxy_cache_bypass $http_upgrade;
      proxy_read_timeout 86400s; # Keep WebSocket connections open
    }
  }
}
```

## User Management

### Assigning Agent Access

Control which users have access to which agents through the Scalytics Copilot Admin panel:

1. Navigate to Admin > User Management
2. Select a user
3. Click "Edit Agent Permissions"
4. Check/uncheck agents for this user
5. Set maximum usage quotas

### Group Permissions

For efficient management, create user groups with predefined agent permissions:

1. Navigate to Admin > Group Management
2. Create or edit a group
3. Under "Agent Permissions," select allowed agents
4. Set group-level usage quotas

## Monitoring and Analytics

### Agent Usage Statistics

The system provides usage statistics for monitoring agent activity:

1. Navigate to Admin > Analytics > Agent Usage
2. View metrics such as:
   - Total agent sessions per day/week/month
   - Average session duration
   - Most frequently used agents
   - Tool usage distribution

### Performance Monitoring

Monitor system performance through the admin dashboard:

1. Navigate to Admin > System > Performance
2. Key metrics include:
   - Active WebSocket connections
   - Message throughput
   - Average response time
   - Resource utilization

### Audit Logging

All agent activities are logged for security and troubleshooting:

1. Navigate to Admin > System > Audit Logs
2. Filter logs by:
   - User
   - Agent type
   - Tool usage
   - Time period
   - Permission level

## Troubleshooting

### Common Issues

#### High Latency in Agent Responses

**Symptoms**: Users report slow agent responses

**Possible Causes**:
- Insufficient server resources
- Network congestion
- Database bottlenecks

**Solutions**:
1. Check server CPU/memory usage
2. Increase server resources if necessary
3. Optimize database queries
4. Consider scaling horizontally

#### WebSocket Connection Failures

**Symptoms**: Users cannot connect to agents or experience frequent disconnections

**Possible Causes**:
- Proxy configuration issues
- Firewall blocking WebSocket connections
- Server timeout settings

**Solutions**:
1. Verify proxy configuration for WebSocket support
2. Check firewall rules for WebSocket traffic
3. Increase timeout settings
4. Implement reconnection logic on client side

#### Permission Errors

**Symptoms**: Users report permission denied errors when using certain tools

**Possible Causes**:
- Misconfigured permission levels
- User not assigned to correct groups
- Tool requires higher permission than expected

**Solutions**:
1. Check user group assignments
2. Verify tool permission requirements
3. Review audit logs for specific permission failures

### Log Analysis

The Scalytics Copilot Agent system writes logs to the following locations:

- **Application logs**: `/var/log/scalyticscopilot/application.log`
- **WebSocket logs**: `/var/log/scalyticscopilot/websocket.log`
- **Agent logs**: `/var/log/scalyticscopilot/agents.log`
- **Error logs**: `/var/log/scalyticscopilot/error.log`

Use the log viewer in Admin > System > Logs for filtering and analysis.

## Security Considerations

### Authentication

The WebSocket connections use the same authentication mechanism as the REST API. Ensure your JWT tokens are properly secured with:

- Short expiration times
- Secure token storage
- HTTPS for all connections

### Rate Limiting

Implement rate limiting to prevent abuse:

1. Navigate to Admin > System > Rate Limits
2. Configure limits for:
   - WebSocket connections per user
   - Messages per minute
   - Tool usage frequency

### Data Privacy

Consider the following for data privacy:

1. Configure data retention policies for agent conversations
2. Implement personal data filtering
3. Ensure compliance with relevant regulations (GDPR, CCPA, etc.)

## Maintenance

### Updates

When updating the Scalytics Copilot Agent system:

1. Review the changelog for breaking changes
2. Backup configuration files
3. Test updates in a staging environment
4. Plan for downtime or use a blue-green deployment
5. Verify functionality after update

### Backup and Recovery

Implement regular backups:

1. Database backups for agent configurations
2. Configuration file backups
3. Log backups for audit purposes

Recovery procedure:

1. Restore configuration files
2. Restore database
3. Restart services
4. Verify WebSocket connectivity
5. Test agent functionality

## Support Resources

- **Documentation**: `/docs/admin/agent-administration.md`
- **Knowledge Base**: Internal support portal > Scalytics Copilot Agents
- **Support Contact**: support@scalyticscopilot.example.com or internal ticket system
