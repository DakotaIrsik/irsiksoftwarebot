const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'irsik Software Discord Bot',
  script: path.join(__dirname, 'index.js')
});

// Listen for the "uninstall" event
svc.on('uninstall', function() {
  console.log('✓ Service uninstalled successfully!');
  console.log('The bot is no longer running as a Windows service.');
});

svc.on('error', function(err) {
  console.error('❌ Error during uninstall:', err);
});

console.log('Uninstalling irsik Software Discord Bot service...');
svc.uninstall();
