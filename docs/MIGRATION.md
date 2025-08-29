# Migration Guide

## Version 2.0.0 to 2.1.0

### What's New
- Enhanced SSH tunnel port management with intelligent automatic port assignment
- Improved connection management and stability
- Better error handling and logging
- Bug fixes and stability improvements

### What's Planned (Not Yet Available)
- Advanced performance analysis with detailed index recommendations
- Configuration templates and hot reloading
- Enhanced schema relationship mapping and circular dependency detection

### Breaking Changes
None. All 2.0.0 configurations remain compatible.

### Configuration Updates
No configuration changes are required. Existing configurations will continue to work as before.

#### Enhanced SSH Tunneling (Optional)
If you want to take advantage of the enhanced SSH tunnel port management:

**Before (v2.0.0):**
```ini
[database.production]
type=postgresql
host=db.internal
port=5432
ssh_host=bastion.com
ssh_username=deploy
ssh_private_key=/path/to/key
local_port=5433  # Manual port assignment
```

**After (v2.1.0):**
```ini
[database.production]
type=postgresql
host=db.internal
port=5432
ssh_host=bastion.com
ssh_username=deploy
ssh_private_key=/path/to/key
# local_port automatically assigned (remove or set to 0)
```

### Known Issues
None at this time.

### Support
If you encounter any issues during migration, please:
1. Check the troubleshooting guides in the documentation
2. Review the server logs for detailed error messages
3. Test connections using the built-in connection test tools

For additional support, refer to the project documentation or create an issue.
