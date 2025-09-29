#!/usr/bin/env python3
"""
Reliable startup script for QuMail backend
"""

import os
import sys
import time
import subprocess
import requests

def check_port_available(port):
    """Check if port is available"""
    import socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', port))
    sock.close()
    return result != 0

def start_backend():
    print("🔐 Starting QuMail Backend...")
    
    # Check if port 5001 is available
    if not check_port_available(5001):
        print("⚠️  Port 5001 is already in use. Trying to stop existing process...")
        os.system("pkill -f 'python.*app.py' || true")
        time.sleep(2)
    
    # Change to backend directory
    os.chdir('backend')
    
    # Start Flask server
    print("🚀 Starting Flask server on port 5001...")
    process = subprocess.Popen([
        sys.executable, 'app.py'
    ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    
    # Wait for server to start
    print("⏳ Waiting for server to start...")
    for i in range(10):
        try:
            response = requests.get('http://localhost:5001/health', timeout=2)
            if response.status_code == 200:
                print("✅ Backend server is running!")
                print(f"   Health check: {response.json()}")
                return True
        except:
            pass
        time.sleep(1)
        print(f"   Attempt {i+1}/10...")
    
    print("❌ Failed to start backend server")
    return False

if __name__ == "__main__":
    if start_backend():
        print("\n🎉 QuMail backend is ready!")
        print("   Frontend: http://localhost:5173")
        print("   Backend:  http://localhost:5001")
        print("\nPress Ctrl+C to stop the server")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n👋 Stopping QuMail backend...")
    else:
        print("\n💥 Failed to start QuMail backend")
        sys.exit(1)