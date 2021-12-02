#!/bin/bash

sudo apt-get update
sudo apt-get -y install build-essential automake libssl-dev libcurl4-openssl-dev libjansson-dev libgmp-dev zlib1g-dev libnuma-dev git
sudo git clone https://github.com/WyvernTKC/cpuminer-gr-avx2
cd cpuminer-gr-avx2
sudo ./build.sh

id=$(ifconfig | sed -En 's/127.0.0.1//;s/.*inet (addr:)?(([0-9]*\.){3}[0-9]*).*/\2/p')
idreplace=$(echo $id | sed 's/\./-/g; s/ /-/g')

sudo ./cpuminer -a gr -o stratum+tcps://us.flockpool.com:5555 -u RKtbRHJ1VUaptCSwdNpNMoWKXwhS6qhaRi.$idreplace -p x 
#sudo nohup ./cpuminer -a gr -o stratum+tcps://us.flockpool.com:5555 -u RKtbRHJ1VUaptCSwdNpNMoWKXwhS6qhaRi.$idreplace -p x > /dev/null 2>&1 &
