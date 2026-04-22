#!/bin/bash

echo "Updating package list..."
sudo apt-get update

echo "Installing Puppeteer shared libraries..."

# Handle Ubuntu 24.04 (Noble) "t64" architecture transitions gracefully
sudo apt-get install -y libasound2 || sudo apt-get install -y libasound2t64
sudo apt-get install -y libatk1.0-0 || sudo apt-get install -y libatk1.0-0t64
sudo apt-get install -y libatk-bridge2.0-0 || sudo apt-get install -y libatk-bridge2.0-0t64
sudo apt-get install -y libcups2 || sudo apt-get install -y libcups2t64
sudo apt-get install -y libgcc1 || sudo apt-get install -y libgcc-s1
sudo apt-get install -y libglib2.0-0 || sudo apt-get install -y libglib2.0-0t64
sudo apt-get install -y libgtk-3-0 || sudo apt-get install -y libgtk-3-0t64

echo "All system dependencies installed successfully!"
