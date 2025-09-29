#!/usr/bin/env python3
"""
Test script to verify QuMail backend is working
"""

import requests
import json

def test_backend():
    base_url = "http://localhost:5001"
    
    print("🧪 Testing QuMail Backend...")
    
    # Test 1: Health check
    try:
        response = requests.get(f"{base_url}/health", timeout=5)
        if response.status_code == 200:
            print("✅ Health check: PASSED")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ Health check: FAILED (Status: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ Health check: FAILED (Error: {e})")
        return False
    
    # Test 2: Login
    try:
        login_data = {
            "email": "test@example.com",
            "password": "testpass"
        }
        response = requests.post(f"{base_url}/api/login", 
                               json=login_data, 
                               timeout=5)
        if response.status_code == 200:
            print("✅ Login: PASSED")
            session_data = response.json()
            session_id = session_data.get('session_id')
            print(f"   Session ID: {session_id}")
        else:
            print(f"❌ Login: FAILED (Status: {response.status_code})")
            return False
    except Exception as e:
        print(f"❌ Login: FAILED (Error: {e})")
        return False
    
    # Test 3: QKD Key Request
    try:
        qkd_data = {
            "sender": "test@example.com",
            "recipient": "recipient@example.com",
            "session_id": session_id
        }
        response = requests.post(f"{base_url}/api/request-qkd-key", 
                               json=qkd_data, 
                               timeout=5)
        if response.status_code == 200:
            print("✅ QKD Key Request: PASSED")
            key_data = response.json()
            print(f"   Key ID: {key_data.get('key_id')}")
        else:
            print(f"❌ QKD Key Request: FAILED (Status: {response.status_code})")
            print(f"   Response: {response.text}")
            return False
    except Exception as e:
        print(f"❌ QKD Key Request: FAILED (Error: {e})")
        return False
    
    print("\n🎉 All backend tests PASSED! QuMail backend is working correctly.")
    return True

if __name__ == "__main__":
    test_backend()