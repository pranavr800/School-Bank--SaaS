#!/bin/bash

# Clone the repository
 git clone https://github.com/pranavr800/School-Bank--SaaS.git

# Change into the directory
 cd School-Bank--SaaS

# Install dependencies
 npm install

# Create output directory if it doesn't exist
 mkdir -p /mnt/user-data/outputs

# Create a zip file
 zip -r /mnt/user-data/outputs/studentbank-saas.zip .
