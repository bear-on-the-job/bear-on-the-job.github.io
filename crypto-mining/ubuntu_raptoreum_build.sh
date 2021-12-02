#!/bin/bash

#sudo wget -O run.sh "https://bear-on-the-job.github.io/crypto-mining/ubuntu_raptoreum_build.sh" && sudo chmod 777 run.sh && sudo ./run.sh

sudo apt-get update
sudo apt-get -y install build-essential automake libssl-dev libcurl4-openssl-dev libjansson-dev libgmp-dev zlib1g-dev libnuma-dev git net-tools
sudo git clone https://github.com/WyvernTKC/cpuminer-gr-avx2
cd cpuminer-gr-avx2
sudo ./build.sh

cat <<EOF >./tune_config
0 0 2 1 0 1 0 0
0 0 1 2 0 1 0 0
0 0 2 2 1 0 0 0
0 0 1 2 1 0 0 0
0 1 1 2 0 0 0 0
0 1 1 2 0 0 0 0
2 0 1 2 0 0 0 0
2 0 2 2 0 0 0 0
0 0 0 2 1 1 1 0
0 0 0 2 1 1 0 0
0 1 0 2 0 1 0 0
0 1 0 2 0 1 0 0
2 0 0 2 0 1 1 0
1 0 0 2 0 1 0 0
0 2 0 2 1 0 1 0
0 1 0 2 1 0 1 0
2 0 0 2 1 0 0 0
2 0 0 2 1 0 1 0
2 1 0 2 0 0 1 0
2 2 0 2 0 0 0 0
0 0 1 0 1 1 1 0
0 0 1 0 1 1 0 0
0 1 1 0 0 1 0 0
0 2 1 0 0 1 1 0
2 0 2 0 0 1 0 0
2 0 1 0 0 1 1 0
0 1 2 0 1 0 1 0
0 1 1 0 1 0 0 0
1 0 1 0 1 0 1 0
2 0 1 0 1 0 1 0
2 1 1 0 0 0 0 0
2 1 1 0 0 0 0 0
0 1 0 0 1 1 1 0
0 1 0 0 1 1 1 0
2 0 0 0 1 1 1 0
2 0 0 0 1 1 0 0
2 2 0 0 0 1 0 0
2 1 0 0 0 1 1 0
2 1 0 0 1 0 1 0
2 1 0 0 1 0 0 0
EOF

id=$(ifconfig | sed -En 's/127.0.0.1//;s/.*inet (addr:)?(([0-9]*\.){3}[0-9]*).*/\2/p')
idreplace=$(echo $id | sed 's/\./-/g; s/ /-/g')

#sudo ./cpuminer -a gr -o stratum+tcps://us.flockpool.com:5555 -u RKtbRHJ1VUaptCSwdNpNMoWKXwhS6qhaRi.$idreplace -p x 
sudo nohup ./cpuminer -a gr -o stratum+tcps://us.flockpool.com:5555 -u RKtbRHJ1VUaptCSwdNpNMoWKXwhS6qhaRi.$idreplace -p x > /dev/null 2>&1 &
