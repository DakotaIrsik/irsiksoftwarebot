const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'irsik Software Discord Bot',
  description: 'Discord bot for managing irsik software Discord server and GitHub integration',
  script: path.join(__dirname, 'index.js'),
  nodeOptions: [
    '--harmony',
    '--max_old_space_size=4096'
  ],
  env: [
    {
      name: 'NODE_ENV',
      value: 'production'
    }
  ]
});

// Listen for the "install" event, which indicates the process is available as a service.
svc.on('install', function() {
  console.log('✓ Service installed successfully!');
  console.log('Starting service...');
  svc.start();
});

svc.on('start', function() {
  console.log('✓ Service started successfully!');
  console.log('The bot is now running as a Windows service.');
  console.log('\nTo manage the service:');
  console.log('  - View in Services: Press Win+R, type "services.msc"');
  console.log('  - Uninstall: node uninstall-service.js');
});

svc.on('alreadyinstalled', function() {
  console.log('⚠ Service is already installed.');
  console.log('To reinstall, first run: node uninstall-service.js');
});

svc.on('error', function(err) {
  console.error('❌ Service error:', err);
});

console.log('Installing irsik Software Discord Bot as a Windows service...');
svc.install();
