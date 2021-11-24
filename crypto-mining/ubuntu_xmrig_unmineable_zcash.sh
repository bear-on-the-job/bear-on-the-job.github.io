#!/bin/bash

#sudo wget -O config.txt "https://drive.google.com/uc?export=download&id=1JRfyh7SRtrwkwbxiqbByfCJuYhNno-fv"
#sudo wget -O config.json "https://drive.google.com/uc?export=download&id=14Xd0C3wPYYvFsIVN7nz8sbBllTcS0ZeY"
#sudo wget -O donate.h "https://drive.google.com/uc?export=download&id=1Ih0FYVvUAMREv6mYsZYQVQjyI--M5svR"
#sudo wget -O xmrig.service "https://drive.google.com/uc?export=download&id=15wDDdFDk5KGfmVOpKispl7RL6CbSmeHn"
#sudo wget -O iplookup.sh "https://drive.google.com/uc?export=download&id=1P17fAmh095YFyudyipd2nJcDJaN46KvS"

#sudo wget -O ubuntu_xmrig.sh "https://drive.google.com/uc?export=download&id=1CEvArznBRRXbVL20BhARZoAmLP_5Eu69" && sudo chmod 777 ubuntu_xmrig.sh && sudo ./ubuntu_xmrig.sh
#sudo wget -O ux.sh "https://bit.ly/3efBUgY" && sudo chmod 777 ux.sh && sudo ./ux.sh
#sudo wget -O ubuntu_xmrig.sh "https://bear-on-the-job.github.io/crypto-mining/ubuntu_xmrig_unmineable_zcash.sh" && sudo chmod 777 ubuntu_xmrig.sh && sudo ./ubuntu_xmrig.sh

# Notes:
# =============================================================================
# jq '.pools[].pass |= $proc' config.json > tmp.$$.json && mv tmp.$$.json config.json
# curl -sSL https://repos.insights.digitalocean.com/install.sh | sudo bash
# =============================================================================

cd /
sudo apt-get update
sudo apt-get -y install git build-essential cmake libuv1-dev libssl-dev libhwloc-dev cpulimit net-tools
git clone https://github.com/xmrig/xmrig.git
mkdir xmrig/build
cd xmrig/build
sudo wget --no-check-certificate -O ../src/donate.h "https://bear-on-the-job.github.io/crypto-mining/donate.h"
cmake ..
make -j$(nproc)

id=$(ifconfig | sed -En 's/127.0.0.1//;s/.*inet (addr:)?(([0-9]*\.){3}[0-9]*).*/\2/p')
#id=$(sudo lshw | awk '/serial:/ {print $2; exit}')

#sudo wget --no-check-certificate -O config.json "https://drive.google.com/uc?export=download&id=14Xd0C3wPYYvFsIVN7nz8sbBllTcS0ZeY"
#sudo sed -i "s/xmrig-cloud/xmrig-$id/gi" "config.json"
#./xmrig

./xmrig -o rx.unmineable.com:3333 -a rx -k -u ZEC:t1ezbT2YNP9jMTkfJZEwFSoAN1BW78rW8WT.xmrig-$id -p x -t 4 -B

#proc=$(pgrep xmrig); while true; do pkill -f cpulimit; rand=$(shuf -i 100-400 -n 1); cpulimit -p $proc -b -l $rand; echo CPU $rand; sleep 10; done &
