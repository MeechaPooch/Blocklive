cd backend/storage/sessions/blocklive
du -h * | sort -h
echo
cd ../../../..
cd backend/storage/
du -h -d0 sessions/blocklive
du -h -d0 sessions/scratchprojects
du -h -d0 users
cd ../..
echo
df -h | grep on$
df -h | grep /$
echo

users=$(ls backend/storage/users | wc -l)
projects=$(ls backend/storage/sessions/blocklive | wc -l)
scratches=$(ls backend/storage/sessions/scratchprojects | wc -l)

echo $users users, $projects bl-projects, $scratches scratch-projects
echo
