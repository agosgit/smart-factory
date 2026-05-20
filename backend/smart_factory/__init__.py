import pymysql

# Pasang pymysql sebagai driver MySQL standar Django untuk mencegah dependensi biner mysqlclient di Windows
pymysql.install_as_MySQLdb()
