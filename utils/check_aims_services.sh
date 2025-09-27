#!/bin/bash

# AIMS Services Health Check Script
# This script checks the status of all AIMS-related services
# Author: Claude Code Assistant
# Date: $(date)

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Service configuration
declare -A SERVICES=(
    ["MongoDB"]="localhost:27017"
    ["Qdrant"]="localhost:6333"
    ["aims-api"]="localhost:3010"
    ["aims-rag-api"]="localhost:8000"
    ["n8n"]="n8nd.giize.com:443"
)

declare -A SERVICE_DESCRIPTIONS=(
    ["MongoDB"]="Document and customer data storage"
    ["Qdrant"]="Vector database for document embeddings"
    ["aims-api"]="Main API service (Node.js)"
    ["aims-rag-api"]="RAG search service (FastAPI)"
    ["n8n"]="Workflow automation service"
)

declare -A HEALTH_ENDPOINTS=(
    ["aims-api"]="http://localhost:3010/api/health"
    ["aims-rag-api"]="http://localhost:8000/docs"
    ["n8n"]="https://n8nd.giize.com/webhook/smartsearch"
)

# Function to print colored output
print_status() {
    local service=$1
    local status=$2
    local message=$3

    if [ "$status" = "OK" ]; then
        echo -e "${service}: ${GREEN}✅ ${status}${NC} - ${message}"
    elif [ "$status" = "WARN" ]; then
        echo -e "${service}: ${YELLOW}⚠️  ${status}${NC} - ${message}"
    else
        echo -e "${service}: ${RED}❌ ${status}${NC} - ${message}"
    fi
}

# Function to check port connectivity
check_port() {
    local host=$1
    local port=$2
    local timeout=3

    if timeout $timeout bash -c "</dev/tcp/$host/$port" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to check HTTP endpoint
check_http() {
    local url=$1
    local timeout=5

    if curl -s --max-time $timeout "$url" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to check MongoDB
check_mongodb() {
    local host="localhost"
    local port="27017"

    echo -e "\n${BLUE}=== MongoDB Check ===${NC}"
    echo "Host: $host, Port: $port"
    echo "Description: ${SERVICE_DESCRIPTIONS["MongoDB"]}"

    if check_port $host $port; then
        if mongosh $host:$port --quiet --eval "quit()" 2>/dev/null; then
            # Get database info
            local db_info=$(mongosh localhost:27017/docupload --quiet --eval "
                print('Collections: ' + db.getCollectionNames().length);
                print('Files: ' + db.files.countDocuments());
                print('Customers: ' + db.customers.countDocuments());
            " 2>/dev/null)
            print_status "MongoDB" "OK" "Connected successfully"
            echo "  Database info: $db_info"
        else
            print_status "MongoDB" "FAIL" "Port open but connection failed"
        fi
    else
        print_status "MongoDB" "FAIL" "Port $port not accessible"
    fi
}

# Function to check Qdrant
check_qdrant() {
    local host="localhost"
    local port="6333"

    echo -e "\n${BLUE}=== Qdrant Vector DB Check ===${NC}"
    echo "Host: $host, Port: $port"
    echo "Description: ${SERVICE_DESCRIPTIONS["Qdrant"]}"

    if check_port $host $port; then
        if check_http "http://$host:$port/health"; then
            print_status "Qdrant" "OK" "Health endpoint responding"
        else
            print_status "Qdrant" "WARN" "Port open but health check failed"
        fi
    else
        print_status "Qdrant" "FAIL" "Port $port not accessible"
    fi
}

# Function to check aims-api
check_aims_api() {
    local host="localhost"
    local port="3010"

    echo -e "\n${BLUE}=== AIMS API Check ===${NC}"
    echo "Host: $host, Port: $port"
    echo "Description: ${SERVICE_DESCRIPTIONS["aims-api"]}"

    if check_port $host $port; then
        if check_http "${HEALTH_ENDPOINTS["aims-api"]}"; then
            # Get API response
            local api_response=$(curl -s "${HEALTH_ENDPOINTS["aims-api"]}" 2>/dev/null)
            print_status "aims-api" "OK" "Health endpoint responding"
            echo "  Response: $api_response"
        else
            print_status "aims-api" "WARN" "Port open but health endpoint failed"
        fi
    else
        print_status "aims-api" "FAIL" "Port $port not accessible"
    fi
}


# Function to check aims-rag-api
check_aims_rag_api() {
    local host="localhost"
    local port="8000"

    echo -e "\n${BLUE}=== AIMS RAG API Check ===${NC}"
    echo "Host: $host, Port: $port"
    echo "Description: ${SERVICE_DESCRIPTIONS["aims-rag-api"]}"

    if check_port $host $port; then
        if check_http "${HEALTH_ENDPOINTS["aims-rag-api"]}"; then
            print_status "aims-rag-api" "OK" "FastAPI docs accessible"
        else
            print_status "aims-rag-api" "WARN" "Port open but docs endpoint failed"
        fi
    else
        print_status "aims-rag-api" "FAIL" "Port $port not accessible"
    fi
}

# Function to check n8n
check_n8n() {
    local host="n8nd.giize.com"
    local port="443"

    echo -e "\n${BLUE}=== n8n Workflow Service Check ===${NC}"
    echo "Host: $host, Port: $port"
    echo "Description: ${SERVICE_DESCRIPTIONS["n8n"]}"

    if check_http "${HEALTH_ENDPOINTS["n8n"]}"; then
        print_status "n8n" "OK" "Webhook endpoint accessible"
    else
        print_status "n8n" "FAIL" "Webhook endpoint not accessible"
    fi
}

# Function to check Docker containers
check_docker_containers() {
    echo -e "\n${BLUE}=== Docker Containers Check ===${NC}"

    if command -v docker >/dev/null 2>&1; then
        echo "AIMS-related Docker containers:"
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "(aims|qdrant|n8n)" || echo "No AIMS containers found"
    else
        echo "Docker command not available"
    fi
}

# Function to show port summary
show_port_summary() {
    echo -e "\n${BLUE}=== Port Summary ===${NC}"
    echo "Service              Port    Status"
    echo "-----------------------------------"

    for service in "${!SERVICES[@]}"; do
        local address=${SERVICES[$service]}
        local host=$(echo $address | cut -d: -f1)
        local port=$(echo $address | cut -d: -f2)

        if [[ $host == "localhost" ]]; then
            if check_port $host $port; then
                echo -e "$service$(printf '%*s' $((20-${#service})) '')$port    ${GREEN}OPEN${NC}"
            else
                echo -e "$service$(printf '%*s' $((20-${#service})) '')$port    ${RED}CLOSED${NC}"
            fi
        else
            # External service
            echo -e "$service$(printf '%*s' $((20-${#service})) '')$port    ${YELLOW}EXTERNAL${NC}"
        fi
    done
}

# Main execution
main() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}    AIMS Services Health Check Report${NC}"
    echo -e "${BLUE}    Generated: $(date)${NC}"
    echo -e "${BLUE}================================================${NC}"

    # Check each service
    check_mongodb
    check_qdrant
    check_aims_api
    check_aims_rag_api
    check_n8n

    # Show Docker containers
    check_docker_containers

    # Show port summary
    show_port_summary

    echo -e "\n${BLUE}=== Health Check Complete ===${NC}"
    echo "For aims-uix2 frontend, only MongoDB and aims-api are required."
    echo "Other services are optional depending on features used."
}

# Execute main function
main "$@"