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
    
    # Install dependencies if needed
    print("📦 Checking Python dependencies...")
    try:
        # Use virtual environment python if available
        venv_python = '.venv/bin/python' if os.path.exists('.venv/bin/python') else sys.executable
        subprocess.run([venv_python, '-m', 'pip', 'install', '-r', 'requirements.txt'], 
                      check=True, capture_output=True)
        print("✅ Dependencies installed/verified")
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Warning: Could not install dependencies: {e}")
    
    # Start Flask server
    print("🚀 Starting Flask server on port 5001...")
    try:
        # Use virtual environment python if available, fallback to system python
        venv_python = '.venv/bin/python' if os.path.exists('.venv/bin/python') else 'python3'
        process = subprocess.Popen([
            venv_python, 'backend/app.py'
        ], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    except Exception as e:
        print(f"❌ Failed to start Flask process: {e}")
        return False
    
    # Wait for server to start
    print("⏳ Waiting for server to start...")
    for i in range(10):
        try:
            response = requests.get('http://localhost:5001/health', timeout=2)
            if response.status_code == 200:
                print("✅ Backend server is running!")
                print(f"   Health check: {response.json()}")
                return True
        except Exception as e:
            if i == 9:  # Last attempt
                print(f"   Connection error: {e}")
                # Check if process is still running
                if process.poll() is not None:
                    stdout, stderr = process.communicate()
                    print(f"❌ Flask process exited with code {process.returncode}")
                    if stdout:
                        print(f"   Output: {stdout}")
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
            # Properly terminate the Flask process
            if 'process' in locals():
                process.terminate()
                process.wait()
    else:
        print("\n💥 Failed to start QuMail backend")
        sys.exit(1)