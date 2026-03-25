#!/bin/bash

# Define the output directory
OUTPUT_DIR="outputs"

# Create the output directory if it doesn't exist
mkdir -p $OUTPUT_DIR

# Clone the repository
REPO_URL="https://github.com/pranavr800/School-Bank--SaaS.git"
git clone $REPO_URL

# Change directory to the project folder
cd School-Bank--SaaS

# Build the project (assuming a build command is defined in the project)
# This could be 'npm install', 'make', 'gradle build', etc., based on the project
# Run the appropriate command here. For demonstration, let's assume 'make build'
make build

# Create a zip file of the project
cd ..
zip -r "$OUTPUT_DIR/StudentBank_SaaS_$(date +'%Y%m%d_%H%M%S').zip" "School-Bank--SaaS"

# Script completed
echo "Build completed and zip file created at $OUTPUT_DIR"