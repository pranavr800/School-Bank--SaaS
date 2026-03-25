import React from 'react';

const StudentDashboardPage = () => {
    const [balance, setBalance] = React.useState(0);
    const [transactions, setTransactions] = React.useState([]);

    React.useEffect(() => {
        // Fetch balance and transactions from API
        const fetchDashboardData = async () => {
            // Simulated API fetch 
            const fetchedBalance = 1000; // For example purposes
            const fetchedTransactions = [
                { id: 1, amount: -50, description: 'Book Purchase' },
                { id: 2, amount: 100, description: 'Deposit' },
                { id: 3, amount: -20, description: 'Stationery Purchase' }
            ];
            setBalance(fetchedBalance);
            setTransactions(fetchedTransactions);
        }; 
        fetchDashboardData();
    }, []);

    return (
        <div>
            <h1>Student Dashboard</h1>
            <h2>Balance: ${balance}</h2>
            <h3>Transactions:</h3>
            <ul>
                {transactions.map(transaction => (
                    <li key={transaction.id}>{transaction.description}: ${transaction.amount}</li>
                ))}
            </ul>
        </div>
    );
};

export default StudentDashboardPage;
