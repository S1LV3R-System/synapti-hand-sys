#!/bin/bash
# Production API Fix Verification Script
# Tests all previously failing endpoints

API_URL="https://app.synaptihand.com"

echo "=================================="
echo "Production API Fix Verification"
echo "=================================="
echo ""
echo "Testing Date: $(date)"
echo "Target: $API_URL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test endpoints
ENDPOINTS=(
  "/api/system/health"
  "/api/stats"
  "/api/projects"
  "/api/patients"
  "/api/stats/comparison"
  "/api/invitations/me"
)

echo "Testing endpoints..."
echo ""

SUCCESS=0
FAILED=0

for endpoint in "${ENDPOINTS[@]}"; do
  echo -n "Testing $endpoint... "
  
  # Make request and capture timing
  RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}\nTIME:%{time_total}" "$API_URL$endpoint" 2>/dev/null)
  
  HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
  TIME=$(echo "$RESPONSE" | grep "TIME:" | cut -d':' -f2)
  
  # Convert time to milliseconds
  TIME_MS=$(echo "$TIME * 1000" | bc)
  
  if [ "$HTTP_CODE" == "200" ]; then
    if (( $(echo "$TIME < 1.0" | bc -l) )); then
      echo -e "${GREEN}✓ PASS${NC} (${TIME_MS}ms)"
      ((SUCCESS++))
    else
      echo -e "${YELLOW}⚠ SLOW${NC} (${TIME_MS}ms - HTTP 200 but >1s)"
      ((SUCCESS++))
    fi
  else
    echo -e "${RED}✗ FAIL${NC} (HTTP $HTTP_CODE, ${TIME_MS}ms)"
    ((FAILED++))
  fi
done

echo ""
echo "=================================="
echo "Results Summary"
echo "=================================="
echo "Total endpoints tested: ${#ENDPOINTS[@]}"
echo -e "${GREEN}Passed: $SUCCESS${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED - Production fix verified!${NC}"
  exit 0
else
  echo -e "${RED}❌ TESTS FAILED - Production still has issues${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Verify DATABASE_URL was updated correctly"
  echo "2. Check backend service restarted"
  echo "3. Review backend logs for errors"
  echo "4. Run: docker logs -f handpose-backend"
  exit 1
fi
