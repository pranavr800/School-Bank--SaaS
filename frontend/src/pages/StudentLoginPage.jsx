import React, { useState } from 'react';

function StudentLoginPage() {
    const [studentPin, setStudentPin] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        // Basic validation
        if (!studentPin) {
            setError('Please enter your student PIN.');
            return;
        }
        // Handle student PIN authentication logic here
        console.log('Student PIN submitted:', studentPin);
    };

    return (
        <div className="student-login-page">
            <h2>Student Login</h2>
            {error && <p className="error">{error}</p>}
            <form onSubmit={handleSubmit}>
                <div>
                    <label htmlFor="pin">Student PIN:</label>
                    <input
                        type="password"
                        id="pin"
                        value={studentPin}
                        onChange={(e) => setStudentPin(e.target.value)}
                        required
                    />
                </div>
                <button type="submit">Login</button>
            </form>
        </div>
    );
}

export default StudentLoginPage;